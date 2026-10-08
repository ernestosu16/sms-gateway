package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"sync"
	"testing"

	smsgateway "github.com/mattboston/sms-gateway"
	"github.com/mattboston/sms-gateway/internal/models"
)

// TestOpenSQLitePragmasApplyToEveryConnection guards against connection
// pragmas being set on only one pooled connection. busy_timeout and
// foreign_keys are per-connection in SQLite; a pool connection opened without
// busy_timeout fails concurrent writes immediately with SQLITE_BUSY.
func TestOpenSQLitePragmasApplyToEveryConnection(t *testing.T) {
	db, err := New("sqlite", filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() { db.Close() })

	ctx := context.Background()
	// Hold several connections at once so the pool must open new ones.
	conns := make([]*sql.Conn, 4)
	for i := range conns {
		c, err := db.Conn(ctx)
		if err != nil {
			t.Fatalf("db.Conn() error = %v", err)
		}
		t.Cleanup(func() { c.Close() })
		conns[i] = c
	}

	for i, c := range conns {
		var busyTimeout, foreignKeys int
		var journalMode string
		if err := c.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&busyTimeout); err != nil {
			t.Fatalf("conn %d: reading busy_timeout: %v", i, err)
		}
		if err := c.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
			t.Fatalf("conn %d: reading foreign_keys: %v", i, err)
		}
		if err := c.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&journalMode); err != nil {
			t.Fatalf("conn %d: reading journal_mode: %v", i, err)
		}
		if busyTimeout != 5000 {
			t.Errorf("conn %d: busy_timeout = %d, want 5000", i, busyTimeout)
		}
		if foreignKeys != 1 {
			t.Errorf("conn %d: foreign_keys = %d, want 1", i, foreignKeys)
		}
		if journalMode != "wal" {
			t.Errorf("conn %d: journal_mode = %q, want %q", i, journalMode, "wal")
		}
	}
}

// TestConcurrentDeleteMessages mirrors the WebUI bulk delete, which issues one
// DELETE request per selected message in parallel. Every delete must wait for
// the write lock rather than fail with SQLITE_BUSY.
func TestConcurrentDeleteMessages(t *testing.T) {
	db, err := New("sqlite", filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := RunMigrations(db, "sqlite", smsgateway.MigrationsFS); err != nil {
		t.Fatalf("running migrations: %v", err)
	}
	repo := NewRepository(db)

	const n = 50
	ids := make([]string, n)
	for i := range ids {
		msg, err := repo.CreateMessage(models.DirectionInbound, "+15551234567", "Hello", models.StatusReceived, nil)
		if err != nil {
			t.Fatalf("CreateMessage() error = %v", err)
		}
		ids[i] = msg.ID
	}

	var wg sync.WaitGroup
	errs := make(chan error, n)
	for _, id := range ids {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := repo.DeleteMessage(id); err != nil {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		t.Errorf("DeleteMessage() error = %v", err)
	}
}
