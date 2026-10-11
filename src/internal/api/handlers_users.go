package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/mattboston/sms-gateway/internal/auth"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
)

// UserHandler handles user management endpoints (admin only).
type UserHandler struct {
	repo *database.Repository
}

// NewUserHandler creates a new UserHandler.
func NewUserHandler(repo *database.Repository) *UserHandler {
	return &UserHandler{repo: repo}
}

// HandleListUsers returns users, newest first.
//
// @Summary      List users
// @Description  Returns user accounts, newest first. Requires admin privileges.
// @Tags         Users
// @Produce      json
// @Param        limit   query     int  false  "Maximum users to return (max 500). Omit to return all."
// @Param        offset  query     int  false  "Users to skip. Only applied together with limit."
// @Success      200  {array}   models.User  "Total users is returned in the X-Total-Count header"
// @Failure      400  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/users [get]
func (h *UserHandler) HandleListUsers(w http.ResponseWriter, r *http.Request) {
	opts, err := parseListOptions(r)
	if err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	users, err := h.repo.ListUsers(opts)
	if err != nil {
		writeInternalError(w, "failed to list users")
		return
	}

	total, err := h.repo.CountUsers()
	if err != nil {
		writeInternalError(w, "failed to count users")
		return
	}

	writePage(w, users, total)
}

// HandleCreateUser creates a new user account.
//
// @Summary      Create user
// @Description  Creates a new user account with the specified username, password, and admin status. Requires admin privileges.
// @Tags         Users
// @Accept       json
// @Produce      json
// @Param        request  body      models.CreateUserRequest  true  "User creation request"
// @Success      201      {object}  models.User
// @Failure      400      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/users [post]
func (h *UserHandler) HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req models.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_body", "invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "credentials_required", "username and password are required")
		return
	}
	if len(req.Password) < minPasswordLength {
		writeAppError(w, http.StatusBadRequest, errPasswordTooShort)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeInternalError(w, "failed to hash password")
		return
	}

	user, err := h.repo.CreateUser(req.Username, hash, req.IsAdmin, false)
	if err != nil {
		writeInternalError(w, "failed to create user")
		return
	}

	writeJSON(w, http.StatusCreated, user)
}

// HandleDeleteUser permanently deletes a user account and its API keys.
//
// @Summary      Delete user
// @Description  Permanently deletes a non-admin user account and its API keys. Messages sent with those keys are kept. Administrator accounts cannot be deleted. Requires admin privileges.
// @Tags         Users
// @Produce      json
// @Param        id   path      string  true  "User ID"
// @Success      200  {object}  map[string]string  "message: user deleted"
// @Failure      403  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/users/{id} [delete]
func (h *UserHandler) HandleDeleteUser(w http.ResponseWriter, r *http.Request) {
	err := h.repo.DeleteUser(chi.URLParam(r, "id"))
	switch {
	case errors.Is(err, database.ErrAdminUserProtected):
		writeError(w, http.StatusForbidden, "admin_user_protected", "administrator accounts cannot be deleted")
	case errors.Is(err, sql.ErrNoRows):
		writeError(w, http.StatusNotFound, "user_not_found", "user not found")
	case err != nil:
		writeInternalError(w, "failed to delete user")
	default:
		writeJSON(w, http.StatusOK, map[string]string{"message": "user deleted"})
	}
}
