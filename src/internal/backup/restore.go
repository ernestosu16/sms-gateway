package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite" // register sqlite database/sql driver
)

// maxSmallEntry caps the manifest and config entries, which are read into memory.
const maxSmallEntry = 1 << 20

// ErrTargetExists is returned when a file would be replaced without Force.
var ErrTargetExists = errors.New("target already exists")

// RestoreOptions configures Restore.
type RestoreOptions struct {
	// DBPath is where the SQLite database is written. Empty skips the database.
	DBPath string
	// ConfigFile is where the config file is written. Empty skips it.
	ConfigFile string
	// SkipConfig leaves the existing config file untouched.
	SkipConfig bool
	// Force replaces existing files. The previous ones are kept next to them
	// with a .pre-restore-<timestamp> suffix.
	Force bool
	Now   time.Time
}

// Result reports what Restore did.
type Result struct {
	Manifest         *Manifest
	DatabaseRestored bool
	ConfigRestored   bool
	ConfigUnchanged  bool
	// Kept lists the existing files that were moved aside.
	Kept []string
}

// Restore reads an archive written by Create and puts its files in place.
// Nothing is replaced until the whole archive has been read and checked.
func Restore(r io.Reader, opts RestoreOptions) (*Result, error) {
	now := opts.Now
	if now.IsZero() {
		now = time.Now()
	}

	var (
		manifestData []byte
		configData   []byte
		hasConfig    bool
		stagedDB     string
	)
	// Remove the staged database unless it was moved into place.
	defer func() {
		if stagedDB != "" {
			os.Remove(stagedDB)
		}
	}()

	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("reading archive: %w", err)
	}
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("reading archive: %w", err)
		}
		if hdr.Typeflag != tar.TypeReg {
			return nil, fmt.Errorf("unexpected entry in archive: %q", hdr.Name)
		}
		switch hdr.Name {
		case manifestName:
			if manifestData, err = readSmall(tr, hdr.Name); err != nil {
				return nil, err
			}
		case configName:
			if configData, err = readSmall(tr, hdr.Name); err != nil {
				return nil, err
			}
			hasConfig = true
		case databaseName:
			if opts.DBPath == "" {
				continue
			}
			if stagedDB, err = stageDatabase(tr, opts.DBPath); err != nil {
				return nil, err
			}
		default:
			return nil, fmt.Errorf("unexpected entry in archive: %q", hdr.Name)
		}
	}

	if manifestData == nil {
		return nil, errors.New("not an sms-gateway backup: manifest.json missing")
	}
	m := &Manifest{}
	if err := json.Unmarshal(manifestData, m); err != nil {
		return nil, fmt.Errorf("reading manifest: %w", err)
	}
	if m.FormatVersion != FormatVersion {
		return nil, fmt.Errorf("unsupported backup format %d (this version reads format %d)", m.FormatVersion, FormatVersion)
	}
	if m.Database && opts.DBPath != "" && stagedDB == "" {
		return nil, errors.New("backup is incomplete: database missing")
	}

	if stagedDB != "" {
		if err := checkIntegrity(stagedDB); err != nil {
			return nil, err
		}
	}

	writeConfig := hasConfig && !opts.SkipConfig && opts.ConfigFile != ""
	res := &Result{Manifest: m}
	if writeConfig {
		current, err := os.ReadFile(opts.ConfigFile)
		if err == nil && bytes.Equal(current, configData) {
			writeConfig = false
			res.ConfigUnchanged = true
		}
	}

	// Check every target before touching any of them.
	if !opts.Force {
		var existing []string
		if stagedDB != "" && exists(opts.DBPath) {
			existing = append(existing, opts.DBPath)
		}
		if writeConfig && exists(opts.ConfigFile) {
			existing = append(existing, opts.ConfigFile)
		}
		if len(existing) > 0 {
			return nil, fmt.Errorf("%w: %v (use --force to replace; the current files are kept with a .pre-restore suffix)", ErrTargetExists, existing)
		}
	}

	suffix := ".pre-restore-" + now.Format("20060102-150405")

	if stagedDB != "" {
		// The -wal and -shm files belong to the old database; leaving them would
		// replay old pages over the restored one.
		for _, p := range []string{opts.DBPath, opts.DBPath + "-wal", opts.DBPath + "-shm"} {
			kept, err := moveAside(p, suffix)
			if err != nil {
				return nil, err
			}
			if kept != "" {
				res.Kept = append(res.Kept, kept)
			}
		}
		if err := os.Rename(stagedDB, opts.DBPath); err != nil {
			return nil, fmt.Errorf("placing database: %w", err)
		}
		stagedDB = ""
		matchParentOwner(opts.DBPath)
		res.DatabaseRestored = true
	}

	if writeConfig {
		kept, err := moveAside(opts.ConfigFile, suffix)
		if err != nil {
			return nil, err
		}
		if kept != "" {
			res.Kept = append(res.Kept, kept)
		}
		if err := writeFileAtomic(opts.ConfigFile, configData); err != nil {
			return nil, fmt.Errorf("writing config file: %w", err)
		}
		matchParentOwner(opts.ConfigFile)
		res.ConfigRestored = true
	}

	return res, nil
}

func readSmall(r io.Reader, name string) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, maxSmallEntry+1))
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", name, err)
	}
	if len(data) > maxSmallEntry {
		return nil, fmt.Errorf("%s is too large", name)
	}
	return data, nil
}

// stageDatabase copies the database entry into a temp file next to dbPath, so
// putting it in place is a rename on the same filesystem.
func stageDatabase(r io.Reader, dbPath string) (string, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("creating database directory: %w", err)
	}
	f, err := os.CreateTemp(dir, ".restore-*.db")
	if err != nil {
		return "", fmt.Errorf("staging database: %w", err)
	}
	if _, err := io.Copy(f, r); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", fmt.Errorf("staging database: %w", err)
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("staging database: %w", err)
	}
	return f.Name(), nil
}

func checkIntegrity(path string) error {
	dsn := (&url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro"}).String()
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("opening backed up database: %w", err)
	}
	defer db.Close()
	var result string
	if err := db.QueryRow("PRAGMA integrity_check").Scan(&result); err != nil {
		return fmt.Errorf("checking backed up database: %w", err)
	}
	if result != "ok" {
		return fmt.Errorf("backed up database is corrupt: %s", result)
	}
	return nil
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

// moveAside renames path to path+suffix when it exists and returns the new name.
func moveAside(path, suffix string) (string, error) {
	if !exists(path) {
		return "", nil
	}
	dest := path + suffix
	if err := os.Rename(path, dest); err != nil {
		return "", fmt.Errorf("keeping %s: %w", path, err)
	}
	return dest, nil
}

func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".restore-*.conf")
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(f.Name())
		return err
	}
	if err := f.Chmod(fileMode); err != nil {
		f.Close()
		os.Remove(f.Name())
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return err
	}
	if err := os.Rename(f.Name(), path); err != nil {
		os.Remove(f.Name())
		return err
	}
	return nil
}
