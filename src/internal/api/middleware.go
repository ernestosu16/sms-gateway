package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/mattboston/sms-gateway/internal/auth"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
)

type contextKey string

const (
	contextKeyUser   contextKey = "user"
	contextKeyAPIKey contextKey = "apikey"
)

// AuthMiddleware validates JWT tokens from the Authorization header.
// Users who still have to change their password are refused, so a default or
// leaked password is only good for choosing a new one.
func AuthMiddleware(jwtSecret string, repo *database.Repository) func(http.Handler) http.Handler {
	return jwtMiddleware(jwtSecret, repo, false)
}

// PasswordChangeAuthMiddleware is AuthMiddleware for the routes a user who must
// change their password still needs: changing it and logging out.
func PasswordChangeAuthMiddleware(jwtSecret string, repo *database.Repository) func(http.Handler) http.Handler {
	return jwtMiddleware(jwtSecret, repo, true)
}

func jwtMiddleware(jwtSecret string, repo *database.Repository, allowPendingPasswordChange bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractJWT(r)
			if tokenStr == "" {
				writeJSON(w, http.StatusUnauthorized, models.ErrorResponse{Error: "missing or invalid token"})
				return
			}

			claims, status, msg := authenticateJWT(jwtSecret, repo, tokenStr, allowPendingPasswordChange)
			if claims == nil {
				writeJSON(w, status, models.ErrorResponse{Error: msg})
				return
			}

			ctx := context.WithValue(r.Context(), contextKeyUser, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// authenticateJWT validates tokenStr and loads its user. On success it returns
// the claims with IsAdmin taken from the database, so a token cannot outlive
// its user, a logout or password change, or privileges the user no longer has. Otherwise it returns nil
// with the status and message to answer.
func authenticateJWT(jwtSecret string, repo *database.Repository, tokenStr string, allowPendingPasswordChange bool) (*auth.JWTClaims, int, string) {
	claims, err := auth.ValidateJWT(jwtSecret, tokenStr)
	if err != nil {
		return nil, http.StatusUnauthorized, "invalid token"
	}

	user, err := repo.GetUserByID(claims.UserID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, http.StatusUnauthorized, "invalid token"
	}
	if err != nil {
		return nil, http.StatusInternalServerError, "failed to load user"
	}
	if claims.TokenVersion != user.TokenVersion {
		return nil, http.StatusUnauthorized, "token revoked"
	}
	if user.MustChangePassword && !allowPendingPasswordChange {
		return nil, http.StatusForbidden, "password change required"
	}

	claims.IsAdmin = user.IsAdmin
	return claims, 0, ""
}

// KeyMiddleware validates API keys from the X-API-Key header.
func KeyMiddleware(repo *database.Repository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("X-API-Key")
			if key == "" {
				writeJSON(w, http.StatusUnauthorized, models.ErrorResponse{Error: "missing API key"})
				return
			}

			apiKey, err := repo.GetAPIKeyByKey(key)
			if err != nil {
				writeJSON(w, http.StatusUnauthorized, models.ErrorResponse{Error: "invalid API key"})
				return
			}

			ctx := context.WithValue(r.Context(), contextKeyAPIKey, apiKey)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// CombinedAuthMiddleware accepts either a JWT token or an API key.
func CombinedAuthMiddleware(jwtSecret string, repo *database.Repository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Try JWT first. A token that fails validation falls through to the
			// API key, but a valid token refused for another reason is final.
			if tokenStr := extractJWT(r); tokenStr != "" {
				claims, status, msg := authenticateJWT(jwtSecret, repo, tokenStr, false)
				if claims != nil {
					ctx := context.WithValue(r.Context(), contextKeyUser, claims)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
				if status != http.StatusUnauthorized {
					writeJSON(w, status, models.ErrorResponse{Error: msg})
					return
				}
			}

			// Try API key.
			if key := r.Header.Get("X-API-Key"); key != "" {
				apiKey, err := repo.GetAPIKeyByKey(key)
				if err == nil {
					ctx := context.WithValue(r.Context(), contextKeyAPIKey, apiKey)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			writeJSON(w, http.StatusUnauthorized, models.ErrorResponse{Error: "authentication required"})
		})
	}
}

// AdminMiddleware requires the authenticated user to be an admin.
func AdminMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := GetUserFromContext(r.Context())
		if claims == nil || !claims.IsAdmin {
			writeJSON(w, http.StatusForbidden, models.ErrorResponse{Error: "admin access required"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GetUserFromContext retrieves JWT claims from the request context.
func GetUserFromContext(ctx context.Context) *auth.JWTClaims {
	claims, _ := ctx.Value(contextKeyUser).(*auth.JWTClaims)
	return claims
}

// GetAPIKeyFromContext retrieves the API key from the request context.
func GetAPIKeyFromContext(ctx context.Context) *models.APIKey {
	key, _ := ctx.Value(contextKeyAPIKey).(*models.APIKey)
	return key
}

func extractJWT(r *http.Request) string {
	// Only the Authorization header is accepted. A cookie would be sent by the
	// browser on its own, which needs CSRF protection and outlives a logout
	// that only clears the web UI's stored token.
	if header := r.Header.Get("Authorization"); strings.HasPrefix(header, "Bearer ") {
		return strings.TrimPrefix(header, "Bearer ")
	}
	return ""
}
