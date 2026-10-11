package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/mattboston/sms-gateway/internal/apperr"
	"github.com/mattboston/sms-gateway/internal/auth"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
)

// minPasswordLength is the shortest password the API accepts for new users and
// password changes, matching the web UI.
const minPasswordLength = 8

var errPasswordTooShort = apperr.New("password_too_short", "password must be at least {min} characters", apperr.Params{"min": minPasswordLength})

// dummyPasswordHash is checked when a login names an unknown user, so unknown
// and existing usernames cost the same bcrypt time and cannot be told apart.
var dummyPasswordHash, _ = auth.HashPassword("unknown-user-timing-equalizer")

// AuthHandler handles authentication-related endpoints.
type AuthHandler struct {
	repo      *database.Repository
	jwtSecret string
	throttle  *loginThrottle
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(repo *database.Repository, jwtSecret string) *AuthHandler {
	return &AuthHandler{repo: repo, jwtSecret: jwtSecret, throttle: newLoginThrottle(time.Now)}
}

// HandleLogin authenticates a user and returns a JWT token.
//
// @Summary      User login
// @Description  Authenticates a user with username and password, returning a JWT token.
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Param        request  body      models.LoginRequest  true  "Login credentials"
// @Success      200      {object}  models.LoginResponse
// @Failure      400      {object}  models.ErrorResponse
// @Failure      401      {object}  models.ErrorResponse
// @Failure      429      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Router       /api/v1/auth/login [post]
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_body", "invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "credentials_required", "username and password are required")
		return
	}

	// Checked before the password so a blocked guess reveals nothing.
	if wait := h.throttle.retryAfter(req.Username); wait > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Round(time.Second)/time.Second)))
		writeError(w, http.StatusTooManyRequests, "too_many_login_attempts", "too many failed login attempts, try again later")
		return
	}

	user, err := h.repo.GetUserByUsername(req.Username)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeInternalError(w, "failed to load user")
		return
	}
	hash := dummyPasswordHash
	if user != nil {
		hash = user.PasswordHash
	}
	if !auth.CheckPassword(req.Password, hash) || user == nil {
		h.throttle.fail(req.Username)
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "invalid credentials")
		return
	}
	h.throttle.reset(req.Username)

	token, err := auth.GenerateJWT(h.jwtSecret, user.ID, user.IsAdmin, user.TokenVersion)
	if err != nil {
		writeInternalError(w, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, models.LoginResponse{
		Token: token,
		User:  *user,
	})
}

// HandleLogout revokes the caller's tokens.
//
// @Summary      User logout
// @Description  Revokes every token issued to the authenticated user, logging them out on all devices.
// @Tags         Auth
// @Produce      json
// @Success      200  {object}  map[string]string  "message: logged out"
// @Failure      401  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/auth/logout [post]
func (h *AuthHandler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "authentication_required", "authentication required")
		return
	}

	if err := h.repo.RevokeTokens(claims.UserID); err != nil {
		writeInternalError(w, "failed to log out")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// HandleChangePassword allows an authenticated user to change their password.
//
// @Summary      Change password
// @Description  Allows an authenticated user to change their password by providing the current and new passwords. Every existing token is revoked; the response carries a new one for the caller.
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Param        request  body      models.ChangePasswordRequest  true  "Current and new password"
// @Success      200      {object}  models.ChangePasswordResponse
// @Failure      400      {object}  models.ErrorResponse
// @Failure      401      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/auth/change-password [post]
func (h *AuthHandler) HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "authentication_required", "authentication required")
		return
	}

	var req models.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_body", "invalid request body")
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "passwords_required", "current_password and new_password are required")
		return
	}
	if len(req.NewPassword) < minPasswordLength {
		writeAppError(w, http.StatusBadRequest, errPasswordTooShort)
		return
	}

	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		writeInternalError(w, "failed to get user")
		return
	}

	if !auth.CheckPassword(req.CurrentPassword, user.PasswordHash) {
		writeError(w, http.StatusUnauthorized, "current_password_incorrect", "current password is incorrect")
		return
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeInternalError(w, "failed to hash password")
		return
	}

	if err := h.repo.UpdatePassword(user.ID, hash); err != nil {
		writeInternalError(w, "failed to update password")
		return
	}

	// UpdatePassword revoked every token, including the caller's, so issue the
	// caller a fresh one at the new token version.
	user, err = h.repo.GetUserByID(user.ID)
	if err != nil {
		writeInternalError(w, "failed to get user")
		return
	}
	token, err := auth.GenerateJWT(h.jwtSecret, user.ID, user.IsAdmin, user.TokenVersion)
	if err != nil {
		writeInternalError(w, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, models.ChangePasswordResponse{Message: "password updated", Token: token})
}
