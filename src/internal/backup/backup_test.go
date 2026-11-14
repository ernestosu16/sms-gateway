package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func newDB(t *testing.T, path string, rows ...string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec("CREATE TABLE IF NOT EXISTS notes (body TEXT)"); err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if _, err := db.Exec("INSERT INTO notes (body) VALUES (?)", r); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func readNotes(t *testing.T, path string) []string {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rows, err := db.Query("SELECT body FROM notes ORDER BY rowid")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			t.Fatal(err)
		}
		out = append(out, s)
	}
	return out
}

func makeBackup(t *testing.T, opts CreateOptions) []byte {
	t.Helper()
	var buf bytes.Buffer
	if _, err := Create(&buf, opts); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	return buf.Bytes()
}

func TestRoundTrip(t *testing.T) {
	src := t.TempDir()
	db := newDB(t, filepath.Join(src, "a.db"), "hello", "world")
	conf := filepath.Join(src, "a.conf")
	if err := os.WriteFile(conf, []byte("JWT_SECRET=x\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	archive := makeBackup(t, CreateOptions{DB: db, DBDriver: "sqlite", ConfigFile: conf, AppVersion: "1.2.3"})

	dst := t.TempDir()
	opts := RestoreOptions{DBPath: filepath.Join(dst, "data", "b.db"), ConfigFile: filepath.Join(dst, "b.conf")}
	res, err := Restore(bytes.NewReader(archive), opts)
	if err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	if !res.DatabaseRestored || !res.ConfigRestored {
		t.Fatalf("result = %+v, want database and config restored", res)
	}
	if res.Manifest.AppVersion != "1.2.3" || res.Manifest.Config != ConfigFromFile {
		t.Errorf("manifest = %+v", res.Manifest)
	}
	if got := readNotes(t, opts.DBPath); strings.Join(got, ",") != "hello,world" {
		t.Errorf("notes = %v", got)
	}
	if got, _ := os.ReadFile(opts.ConfigFile); string(got) != "JWT_SECRET=x\n" {
		t.Errorf("config = %q", got)
	}
	leftovers, _ := filepath.Glob(filepath.Join(dst, "data", ".restore-*"))
	if len(leftovers) > 0 {
		t.Errorf("staged files left behind: %v", leftovers)
	}
}

func TestRestoreRefusesToOverwriteWithoutForce(t *testing.T) {
	src := t.TempDir()
	archive := makeBackup(t, CreateOptions{DB: newDB(t, filepath.Join(src, "a.db"), "new"), DBDriver: "sqlite"})

	dst := t.TempDir()
	target := filepath.Join(dst, "b.db")
	newDB(t, target, "old").Close()

	_, err := Restore(bytes.NewReader(archive), RestoreOptions{DBPath: target})
	if !errors.Is(err, ErrTargetExists) {
		t.Fatalf("Restore() error = %v, want ErrTargetExists", err)
	}
	if got := readNotes(t, target); strings.Join(got, ",") != "old" {
		t.Errorf("target changed without --force: %v", got)
	}
}

func TestRestoreForceKeepsPreviousFiles(t *testing.T) {
	src := t.TempDir()
	archive := makeBackup(t, CreateOptions{DB: newDB(t, filepath.Join(src, "a.db"), "new"), DBDriver: "sqlite"})

	dst := t.TempDir()
	target := filepath.Join(dst, "b.db")
	newDB(t, target, "old").Close()
	if err := os.WriteFile(target+"-wal", []byte("stale"), 0o600); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2026, 11, 14, 10, 0, 0, 0, time.UTC)
	res, err := Restore(bytes.NewReader(archive), RestoreOptions{DBPath: target, Force: true, Now: now})
	if err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	if got := readNotes(t, target); strings.Join(got, ",") != "new" {
		t.Errorf("notes = %v", got)
	}
	kept := target + ".pre-restore-20261114-100000"
	if got := readNotes(t, kept); strings.Join(got, ",") != "old" {
		t.Errorf("kept notes = %v", got)
	}
	if !exists(target+"-wal.pre-restore-20261114-100000") || len(res.Kept) != 2 {
		t.Errorf("kept = %v, want the database and its WAL", res.Kept)
	}
}

func TestGeneratedConfigWhenFileMissing(t *testing.T) {
	archive := makeBackup(t, CreateOptions{
		DBDriver:        "postgres",
		ConfigFile:      filepath.Join(t.TempDir(), "missing.conf"),
		GeneratedConfig: []byte("JWT_SECRET=y\n"),
	})

	conf := filepath.Join(t.TempDir(), "c.conf")
	res, err := Restore(bytes.NewReader(archive), RestoreOptions{ConfigFile: conf})
	if err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	if res.Manifest.Database || res.Manifest.Config != ConfigGenerated {
		t.Errorf("manifest = %+v", res.Manifest)
	}
	got, _ := os.ReadFile(conf)
	if !strings.HasPrefix(string(got), "# Generated") || !strings.HasSuffix(string(got), "JWT_SECRET=y\n") {
		t.Errorf("config = %q", got)
	}
}

func TestSkipConfig(t *testing.T) {
	src := t.TempDir()
	conf := filepath.Join(src, "a.conf")
	if err := os.WriteFile(conf, []byte("A=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	archive := makeBackup(t, CreateOptions{ConfigFile: conf})

	target := filepath.Join(t.TempDir(), "b.conf")
	if err := os.WriteFile(target, []byte("B=2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(bytes.NewReader(archive), RestoreOptions{ConfigFile: target, SkipConfig: true}); err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	if got, _ := os.ReadFile(target); string(got) != "B=2\n" {
		t.Errorf("config = %q, want it untouched", got)
	}
}

func TestRestoreRejectsUnexpectedEntries(t *testing.T) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	data := []byte("x")
	if err := tw.WriteHeader(&tar.Header{Name: "../evil", Mode: 0o600, Size: 1}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(data); err != nil {
		t.Fatal(err)
	}
	tw.Close()
	gz.Close()

	dir := t.TempDir()
	_, err := Restore(&buf, RestoreOptions{DBPath: filepath.Join(dir, "b.db"), ConfigFile: filepath.Join(dir, "b.conf")})
	if err == nil || !strings.Contains(err.Error(), "unexpected entry") {
		t.Fatalf("Restore() error = %v, want unexpected entry", err)
	}
}

func TestRestoreRejectsCorruptDatabase(t *testing.T) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	if err := writeEntry(tw, manifestName, []byte(`{"format_version":1,"database":true}`), time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := writeEntry(tw, databaseName, bytes.Repeat([]byte("not a database"), 400), time.Now()); err != nil {
		t.Fatal(err)
	}
	tw.Close()
	gz.Close()

	dir := t.TempDir()
	if _, err := Restore(&buf, RestoreOptions{DBPath: filepath.Join(dir, "b.db")}); err == nil {
		t.Fatal("Restore() error = nil, want an integrity error")
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("files left behind: %v", entries)
	}
}
