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

// KeyHandler handles API key management endpoints.
type KeyHandler struct {
	repo *database.Repository
}

// NewKeyHandler creates a new KeyHandler.
func NewKeyHandler(repo *database.Repository) *KeyHandler {
	return &KeyHandler{repo: repo}
}

// HandleListAPIKeys returns all API keys for the authenticated user.
//
// @Summary      List API keys
// @Description  Returns API keys for the authenticated user, newest first. Admins see all keys.
// @Tags         API Keys
// @Produce      json
// @Param        limit   query     int  false  "Maximum keys to return (max 500). Omit to return all."
// @Param        offset  query     int  false  "Keys to skip. Only applied together with limit."
// @Success      200  {array}   models.APIKey  "Total matching keys is returned in the X-Total-Count header"
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/apikeys [get]
func (h *KeyHandler) HandleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "authentication_required", "authentication required")
		return
	}

	opts, err := parseListOptions(r)
	if err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	// The same scope must reach the count. Counting with the wrong scope would
	// leak the global key total to a non-admin through the X-Total-Count header.
	scope := apiKeyScope(claims)

	var keys []models.APIKey
	if scope == "" {
		keys, err = h.repo.ListAPIKeys(opts)
	} else {
		keys, err = h.repo.ListAPIKeysByUserID(scope, opts)
	}
	if err != nil {
		writeInternalError(w, "failed to list API keys")
		return
	}

	total, err := h.repo.CountAPIKeys(scope)
	if err != nil {
		writeInternalError(w, "failed to count API keys")
		return
	}

	writePage(w, keys, total)
}

// HandleCreateAPIKey generates a new API key for the authenticated user.
//
// @Summary      Create API key
// @Description  Generates a new API key for the authenticated user with an optional label.
// @Tags         API Keys
// @Accept       json
// @Produce      json
// @Param        request  body      models.CreateAPIKeyRequest   true  "API key creation request"
// @Success      201      {object}  models.CreateAPIKeyResponse
// @Failure      400      {object}  models.ErrorResponse
// @Failure      401      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/apikeys [post]
func (h *KeyHandler) HandleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "authentication_required", "authentication required")
		return
	}

	var req models.CreateAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_body", "invalid request body")
		return
	}

	key, err := auth.GenerateAPIKey()
	if err != nil {
		writeInternalError(w, "failed to generate API key")
		return
	}

	apiKey, err := h.repo.CreateAPIKey(key, req.Label, claims.UserID)
	if err != nil {
		writeInternalError(w, "failed to create API key")
		return
	}

	writeJSON(w, http.StatusCreated, models.CreateAPIKeyResponse{APIKey: *apiKey})
}

// HandleDeactivateAPIKey deactivates an API key by ID.
//
// @Summary      Deactivate API key
// @Description  Deactivates an API key by its unique identifier. Non-admins can only deactivate their own keys.
// @Tags         API Keys
// @Produce      json
// @Param        id   path      string  true  "API Key ID"
// @Success      200  {object}  map[string]string  "message: API key deactivated"
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/apikeys/{id} [delete]
func (h *KeyHandler) HandleDeactivateAPIKey(w http.ResponseWriter, r *http.Request) {
	h.changeAPIKey(w, r, h.repo.DeactivateAPIKey, "API key deactivated", "failed to deactivate API key")
}

// HandleDeleteAPIKey permanently deletes an API key by ID.
//
// @Summary      Delete API key
// @Description  Permanently deletes an API key by its unique identifier. Non-admins can only delete their own keys.
// @Tags         API Keys
// @Produce      json
// @Param        id   path      string  true  "API Key ID"
// @Success      200  {object}  map[string]string  "message: API key deleted"
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/apikeys/{id}/delete [delete]
func (h *KeyHandler) HandleDeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	h.changeAPIKey(w, r, h.repo.DeleteAPIKey, "API key deleted", "failed to delete API key")
}

// changeAPIKey applies change to the key named in the URL, scoped to the keys
// the caller may manage. Another user's key answers 404, the same as a key
// that does not exist, so non-admins cannot probe for key IDs.
func (h *KeyHandler) changeAPIKey(w http.ResponseWriter, r *http.Request, change func(id, userID string) error, okMsg, failMsg string) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "authentication_required", "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "api_key_id_required", "API key id is required")
		return
	}

	if err := change(id, apiKeyScope(claims)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "api_key_not_found", "API key not found")
			return
		}
		writeInternalError(w, failMsg)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": okMsg})
}

// apiKeyScope returns the user whose keys the caller may list or manage, or ""
// for an admin, who may manage every key.
func apiKeyScope(claims *auth.JWTClaims) string {
	if claims.IsAdmin {
		return ""
	}
	return claims.UserID
}
