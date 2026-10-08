package database

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib" // register pgx database/sql driver
	_ "modernc.org/sqlite"             // register sqlite database/sql driver
)

// New opens a database connection based on the given driver and DSN.
// Supported drivers: "sqlite" and "postgres".
func New(driver, dsn string) (*sql.DB, error) {
	switch driver {
	case "sqlite":
		return openSQLite(dsn)
	case "postgres":
		return openPostgres(dsn)
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", driver)
	}
}

// sqlitePragmas run on every new pooled connection. busy_timeout and
// foreign_keys are per-connection settings, so running them once through
// db.Exec would configure only whichever connection served that call; the
// driver applies DSN _pragma params each time it opens a connection.
//   - busy_timeout: concurrent writers wait for the lock instead of failing
//     immediately with SQLITE_BUSY. Listed first so the WAL switch waits too.
//   - journal_mode=WAL: better concurrent read performance.
//   - foreign_keys: enforce foreign key constraints.
const sqlitePragmas = "_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"

func openSQLite(dsn string) (*sql.DB, error) {
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}

	db, err := sql.Open("sqlite", dsn+sep+sqlitePragmas)
	if err != nil {
		return nil, fmt.Errorf("opening sqlite database: %w", err)
	}

	// sql.Open is lazy; connect now so bad paths and pragma failures surface here.
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("opening sqlite database: %w", err)
	}

	return db, nil
}

func openPostgres(dsn string) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening postgres database: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("pinging postgres database: %w", err)
	}

	return db, nil
}
