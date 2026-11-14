package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/mattboston/sms-gateway/internal/backup"
	"github.com/mattboston/sms-gateway/internal/buildinfo"
	"github.com/mattboston/sms-gateway/internal/config"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

func backupCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "backup",
		Short: "Write a backup archive of the database and config file",
		Long: `Write a .tar.gz with a consistent snapshot of the SQLite database and the
config file. It is safe to run while the server is running.

When no config file exists (Docker), one is generated from the settings in
effect, including JWT_SECRET. The archive holds secrets: keep it private.

With PostgreSQL only the config is archived; back up the database with pg_dump.`,
		Example: `  sms-gateway backup
  sms-gateway backup -o /var/backups/sms-gateway.tar.gz
  docker exec sms-gateway sms-gateway backup -o - > sms-gateway-backup.tar.gz`,
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			output, _ := cmd.Flags().GetString("output")
			now := time.Now()
			if output == "" {
				output = "sms-gateway-backup-" + now.Format("20060102-150405") + ".tar.gz"
			}

			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("loading config: %w", err)
			}

			opts := backup.CreateOptions{
				DBDriver:        cfg.DBDriver,
				ConfigFile:      viper.GetString("config_file"),
				GeneratedConfig: generatedConfig(cfg),
				AppVersion:      buildinfo.String(),
				Now:             now,
			}
			if cfg.DBDriver == "sqlite" {
				if _, err := os.Stat(sqlitePath(cfg.DBDSN)); err != nil {
					return fmt.Errorf("database %s: %w", sqlitePath(cfg.DBDSN), err)
				}
				db, err := database.New(cfg.DBDriver, cfg.DBDSN)
				if err != nil {
					return fmt.Errorf("opening database: %w", err)
				}
				defer db.Close()
				opts.DB = db
			} else {
				fmt.Fprintf(os.Stderr, "Warning: %s databases are not included; back them up with pg_dump.\n", cfg.DBDriver)
			}

			stderr := cmd.ErrOrStderr()
			if output == "-" {
				m, err := backup.Create(cmd.OutOrStdout(), opts)
				if err != nil {
					return err
				}
				printBackupSummary(stderr, "stdout", m)
				return nil
			}

			m, err := createBackupFile(output, opts)
			if err != nil {
				return err
			}
			printBackupSummary(stderr, output, m)
			return nil
		},
	}
	cmd.Flags().StringP("output", "o", "", `Archive path, or "-" for stdout (default ./sms-gateway-backup-<date>.tar.gz)`)
	return cmd
}

// createBackupFile writes the archive next to path and renames it into place,
// so an interrupted backup never leaves a truncated archive under the final name.
func createBackupFile(path string, opts backup.CreateOptions) (*backup.Manifest, error) {
	f, err := os.CreateTemp(filepath.Dir(path), ".sms-gateway-backup-*.tmp")
	if err != nil {
		return nil, fmt.Errorf("creating archive: %w", err)
	}
	tmp := f.Name()
	defer os.Remove(tmp)

	m, err := backup.Create(f, opts)
	if err != nil {
		f.Close()
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, fmt.Errorf("writing archive: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return nil, fmt.Errorf("writing archive: %w", err)
	}
	return m, nil
}

func printBackupSummary(w io.Writer, dest string, m *backup.Manifest) {
	fmt.Fprintf(w, "Backup written to %s\n", dest)
	if m.Database {
		fmt.Fprintln(w, "  Database: included")
	} else {
		fmt.Fprintln(w, "  Database: not included")
	}
	switch m.Config {
	case backup.ConfigFromFile:
		fmt.Fprintln(w, "  Config:   config file")
	case backup.ConfigGenerated:
		fmt.Fprintln(w, "  Config:   generated from the current settings (no config file found)")
	default:
		fmt.Fprintln(w, "  Config:   not included")
	}
	fmt.Fprintln(w, "The archive contains secrets (JWT_SECRET, webhook secrets): keep it private.")
}

func restoreCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "restore ARCHIVE",
		Short: "Restore the database and config file from a backup archive",
		Long: `Restore an archive written by "sms-gateway backup". Stop the server first.

The database goes to --db-dsn and the config file to --config-file. Existing
files are only replaced with --force; the previous ones are kept next to them
with a .pre-restore-<date> suffix. Use "-" to read the archive from stdin.`,
		Example: `  sms-gateway restore --force sms-gateway-backup.tar.gz
  sms-gateway restore --force --skip-config - < sms-gateway-backup.tar.gz`,
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			force, _ := cmd.Flags().GetBool("force")
			skipConfig, _ := cmd.Flags().GetBool("skip-config")

			cfg, err := config.Load()
			if err != nil {
				return fmt.Errorf("loading config: %w", err)
			}

			var in io.Reader = cmd.InOrStdin()
			if args[0] != "-" {
				f, err := os.Open(args[0])
				if err != nil {
					return fmt.Errorf("opening archive: %w", err)
				}
				defer f.Close()
				in = f
			}

			opts := backup.RestoreOptions{
				ConfigFile: viper.GetString("config_file"),
				SkipConfig: skipConfig,
				Force:      force,
			}
			if cfg.DBDriver == "sqlite" {
				opts.DBPath = sqlitePath(cfg.DBDSN)
			}

			res, err := backup.Restore(in, opts)
			if err != nil {
				if errors.Is(err, backup.ErrTargetExists) {
					return fmt.Errorf("%w\nStop the server before restoring", err)
				}
				return err
			}

			w := cmd.ErrOrStderr()
			m := res.Manifest
			fmt.Fprintf(w, "Restored backup from %s (version %s)\n", m.CreatedAt.Local().Format(time.RFC3339), m.AppVersion)
			switch {
			case res.DatabaseRestored:
				fmt.Fprintf(w, "  Database: %s\n", opts.DBPath)
			case m.Database:
				fmt.Fprintf(w, "  Database: skipped (DB_DRIVER is %s; the backup holds a SQLite database)\n", cfg.DBDriver)
			default:
				fmt.Fprintln(w, "  Database: not in the backup")
			}
			switch {
			case res.ConfigRestored:
				fmt.Fprintf(w, "  Config:   %s\n", opts.ConfigFile)
			case res.ConfigUnchanged:
				fmt.Fprintf(w, "  Config:   %s already matches the backup\n", opts.ConfigFile)
			case m.Config != backup.ConfigNotIncluded:
				fmt.Fprintln(w, "  Config:   skipped")
			default:
				fmt.Fprintln(w, "  Config:   not in the backup")
			}
			for _, k := range res.Kept {
				fmt.Fprintf(w, "  Kept previous file as %s\n", k)
			}
			fmt.Fprintln(w, "Start the server; it applies any pending migrations on startup.")
			return nil
		},
	}
	cmd.Flags().Bool("force", false, "Replace existing files (they are kept with a .pre-restore suffix)")
	cmd.Flags().Bool("skip-config", false, "Leave the config file untouched and restore only the database")
	return cmd
}

// sqlitePath returns the file path of a SQLite DSN, dropping a file: prefix
// and any query parameters.
func sqlitePath(dsn string) string {
	path := strings.TrimPrefix(dsn, "file:")
	if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	return path
}

// generatedConfig renders the settings in effect as a config file, used when
// the gateway is configured only through environment variables.
func generatedConfig(cfg *config.Config) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "DB_DRIVER=%s\n", cfg.DBDriver)
	fmt.Fprintf(&b, "DB_DSN=%s\n", cfg.DBDSN)
	fmt.Fprintf(&b, "DEVICE_PATH=%s\n", cfg.DevicePath)
	fmt.Fprintf(&b, "BAUD_RATE=%d\n", cfg.BaudRate)
	fmt.Fprintf(&b, "HOST=%s\n", cfg.Host)
	fmt.Fprintf(&b, "PORT=%d\n", cfg.Port)
	fmt.Fprintf(&b, "JWT_SECRET=%s\n", cfg.JWTSecret)
	if cfg.DevMode {
		b.WriteString("DEV_MODE=true\n")
	}
	return []byte(b.String())
}
