package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/spf13/viper"
)

// minJWTSecretLength is the shortest JWT signing secret serve accepts. RFC 7518
// section 3.2 requires HS256 keys of at least 256 bits.
const minJWTSecretLength = 32

// Config holds all application configuration.
type Config struct {
	DBDriver   string `mapstructure:"db_driver"`
	DBDSN      string `mapstructure:"db_dsn"`
	DevicePath string `mapstructure:"device_path"`
	BaudRate   int    `mapstructure:"baud_rate"`
	Port       int    `mapstructure:"port"`
	DevMode    bool   `mapstructure:"dev_mode"`
	JWTSecret  string `mapstructure:"jwt_secret"`
}

// Load reads configuration from the global viper instance (which has CLI flags bound)
// and environment variables, then returns a Config.
func Load() (*Config, error) {
	viper.SetDefault("db_driver", "sqlite")
	viper.SetDefault("db_dsn", "/opt/sms-gateway/sms-gateway.db")
	viper.SetDefault("device_path", "")
	viper.SetDefault("baud_rate", 9600)
	viper.SetDefault("port", 5174)
	viper.SetDefault("dev_mode", false)
	viper.SetDefault("jwt_secret", "")
	viper.SetDefault("config_file", "/opt/sms-gateway/sms-gateway.conf")

	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	configFile := viper.GetString("config_file")
	if configFile != "" {
		if _, err := os.Stat(configFile); err == nil {
			viper.SetConfigFile(configFile)
			viper.SetConfigType("env")
			if err := viper.ReadInConfig(); err != nil {
				return nil, err
			}
		}
	}

	cfg := &Config{}
	if err := viper.Unmarshal(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

// RequireJWTSecret ensures JWTSecret is safe to sign tokens with.
//
// Anyone who knows the secret can mint an admin token, so a missing or short
// secret is refused rather than replaced by a well-known default. Dev mode only
// drives a mock modem, so when no secret is set it gets a random one that lasts
// until the process exits.
func (c *Config) RequireJWTSecret() error {
	if c.JWTSecret == "" && c.DevMode {
		b := make([]byte, minJWTSecretLength)
		if _, err := rand.Read(b); err != nil {
			return fmt.Errorf("generating dev JWT secret: %w", err)
		}
		c.JWTSecret = hex.EncodeToString(b)
		log.Println("No JWT secret set; using a random one for this dev session (logins end on restart)")
		return nil
	}

	if len(c.JWTSecret) < minJWTSecretLength {
		return fmt.Errorf("JWT secret (JWT_SECRET or --jwt-secret) must be at least %d characters; generate one with: openssl rand -base64 32", minJWTSecretLength)
	}
	return nil
}
