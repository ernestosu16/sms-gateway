package config

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadHost(t *testing.T) {
	t.Setenv("CONFIG_FILE", filepath.Join(t.TempDir(), "missing.conf"))

	tests := []struct {
		name string
		env  string
		want string
	}{
		{name: "default is loopback", want: "127.0.0.1"},
		{name: "HOST env var", env: "0.0.0.0", want: "0.0.0.0"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Viper treats an empty variable as unset.
			t.Setenv("HOST", tt.env)
			cfg, err := Load()
			if err != nil {
				t.Fatalf("Load() error = %v", err)
			}
			if cfg.Host != tt.want {
				t.Errorf("Host = %q, want %q", cfg.Host, tt.want)
			}
		})
	}
}

func TestRequireJWTSecret(t *testing.T) {
	strong := strings.Repeat("s", minJWTSecretLength)

	tests := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{name: "missing", cfg: Config{}, wantErr: true},
		{name: "former default", cfg: Config{JWTSecret: "change-me-in-production"}, wantErr: true},
		{name: "one short of minimum", cfg: Config{JWTSecret: strong[1:]}, wantErr: true},
		{name: "short in dev mode", cfg: Config{JWTSecret: "short", DevMode: true}, wantErr: true},
		{name: "minimum length", cfg: Config{JWTSecret: strong}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := tt.cfg
			err := cfg.RequireJWTSecret()
			if (err != nil) != tt.wantErr {
				t.Fatalf("RequireJWTSecret() error = %v, wantErr %v", err, tt.wantErr)
			}
			if cfg.JWTSecret != tt.cfg.JWTSecret {
				t.Errorf("JWTSecret changed from %q to %q", tt.cfg.JWTSecret, cfg.JWTSecret)
			}
		})
	}
}

func TestRequireJWTSecretGeneratesDevSecret(t *testing.T) {
	first := Config{DevMode: true}
	if err := first.RequireJWTSecret(); err != nil {
		t.Fatalf("RequireJWTSecret() error = %v", err)
	}
	if len(first.JWTSecret) < minJWTSecretLength {
		t.Errorf("generated secret has %d characters, want at least %d", len(first.JWTSecret), minJWTSecretLength)
	}

	second := Config{DevMode: true}
	if err := second.RequireJWTSecret(); err != nil {
		t.Fatalf("RequireJWTSecret() error = %v", err)
	}
	if first.JWTSecret == second.JWTSecret {
		t.Error("two dev sessions generated the same secret")
	}
}
