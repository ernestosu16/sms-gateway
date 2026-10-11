package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/mattboston/sms-gateway/internal/apperr"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/webhook"
)

const (
	maxWebhookNameLength   = 100
	minWebhookSecretLength = 16
)

// WebhookHandler handles webhook management endpoints (admin only).
type WebhookHandler struct {
	repo *database.Repository
}

// NewWebhookHandler creates a new WebhookHandler.
func NewWebhookHandler(repo *database.Repository) *WebhookHandler {
	return &WebhookHandler{repo: repo}
}

// HandleListWebhooks returns webhooks, newest first.
//
// @Summary      List webhooks
// @Description  Returns registered webhooks, newest first. Requires admin privileges.
// @Tags         Webhooks
// @Produce      json
// @Param        limit   query     int  false  "Maximum webhooks to return (max 500). Omit to return all."
// @Param        offset  query     int  false  "Webhooks to skip. Only applied together with limit."
// @Success      200  {array}   models.Webhook  "Total webhooks is returned in the X-Total-Count header"
// @Failure      400  {object}  models.ErrorResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      403  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/webhooks [get]
func (h *WebhookHandler) HandleListWebhooks(w http.ResponseWriter, r *http.Request) {
	opts, err := parseListOptions(r)
	if err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	hooks, err := h.repo.ListWebhooks(opts)
	if err != nil {
		writeInternalError(w, "failed to list webhooks")
		return
	}

	total, err := h.repo.CountWebhooks()
	if err != nil {
		writeInternalError(w, "failed to count webhooks")
		return
	}

	writePage(w, hooks, total)
}

// HandleCreateWebhook registers a new webhook.
//
// @Summary      Create webhook
// @Description  Registers a webhook notified on the selected message events. Leave secret empty to have one generated. Requires admin privileges.
// @Tags         Webhooks
// @Accept       json
// @Produce      json
// @Param        request  body      models.WebhookRequest  true  "Webhook to create"
// @Success      201      {object}  models.Webhook
// @Failure      400      {object}  models.ErrorResponse
// @Failure      401      {object}  models.ErrorResponse
// @Failure      403      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/webhooks [post]
func (h *WebhookHandler) HandleCreateWebhook(w http.ResponseWriter, r *http.Request) {
	var req models.WebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_body", "invalid request body")
		return
	}
	if err := normalizeWebhookRequest(&req); err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	secret := req.Secret
	if secret == "" {
		generated, err := webhook.GenerateSecret()
		if err != nil {
			writeInternalError(w, "failed to generate webhook secret")
			return
		}
		secret = generated
	}
	isActive := req.IsActive == nil || *req.IsActive

	hook, err := h.repo.CreateWebhook(req.Name, req.URL, secret, req.Events, isActive)
	if err != nil {
		writeInternalError(w, "failed to create webhook")
		return
	}

	writeJSON(w, http.StatusCreated, hook)
}

// HandleUpdateWebhook replaces a webhook's settings.
//
// @Summary      Update webhook
// @Description  Replaces a webhook's name, URL and events. An empty secret keeps the current one and an omitted is_active keeps the current state. Requires admin privileges.
// @Tags         Webhooks
// @Accept       json
// @Produce      json
// @Param        id       path      string                 true  "Webhook ID"
// @Param        request  body      models.WebhookRequest  true  "New webhook settings"
// @Success      200      {object}  models.Webhook
// @Failure      400      {object}  models.ErrorResponse
// @Failure      401      {object}  models.ErrorResponse
// @Failure      403      {object}  models.ErrorResponse
// @Failure      404      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/webhooks/{id} [put]
func (h *WebhookHandler) HandleUpdateWebhook(w http.ResponseWriter, r *http.Request) {
	var req models.WebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_body", "invalid request body")
		return
	}
	if err := normalizeWebhookRequest(&req); err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	hook, err := h.repo.GetWebhook(chi.URLParam(r, "id"))
	if err != nil {
		writeWebhookError(w, err, "failed to load webhook")
		return
	}

	hook.Name = req.Name
	hook.URL = req.URL
	hook.Events = req.Events
	if req.Secret != "" {
		hook.Secret = req.Secret
	}
	if req.IsActive != nil {
		hook.IsActive = *req.IsActive
	}

	updated, err := h.repo.UpdateWebhook(hook)
	if err != nil {
		writeWebhookError(w, err, "failed to update webhook")
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

// HandleDeleteWebhook permanently deletes a webhook.
//
// @Summary      Delete webhook
// @Description  Permanently deletes a webhook. Requires admin privileges.
// @Tags         Webhooks
// @Produce      json
// @Param        id   path      string  true  "Webhook ID"
// @Success      200  {object}  map[string]string  "message: webhook deleted"
// @Failure      401  {object}  models.ErrorResponse
// @Failure      403  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/webhooks/{id} [delete]
func (h *WebhookHandler) HandleDeleteWebhook(w http.ResponseWriter, r *http.Request) {
	if err := h.repo.DeleteWebhook(chi.URLParam(r, "id")); err != nil {
		writeWebhookError(w, err, "failed to delete webhook")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "webhook deleted"})
}

// writeWebhookError answers 404 for a missing webhook and 500 with msg for any
// other repository failure.
func writeWebhookError(w http.ResponseWriter, err error, msg string) {
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "webhook_not_found", "webhook not found")
		return
	}
	writeInternalError(w, msg)
}

// normalizeWebhookRequest trims req in place, removes duplicate events and
// rejects anything the dispatcher could not deliver.
func normalizeWebhookRequest(req *models.WebhookRequest) error {
	req.Name = strings.TrimSpace(req.Name)
	req.URL = strings.TrimSpace(req.URL)
	req.Secret = strings.TrimSpace(req.Secret)

	if req.Name == "" {
		return errNameRequired
	}
	if utf8.RuneCountInString(req.Name) > maxWebhookNameLength {
		return nameTooLong(maxWebhookNameLength)
	}

	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return apperr.New("webhook_url_invalid", "url must be an absolute http or https URL", nil)
	}
	// Hostnames are checked again when each delivery dials, after DNS
	// resolution; a literal IP can be refused right away.
	if ip, err := netip.ParseAddr(u.Hostname()); err == nil {
		if err := webhook.CheckDestination(ip); err != nil {
			return apperr.New("webhook_url_not_allowed", "url: {reason}", apperr.Params{"reason": err})
		}
	}

	if req.Secret != "" && len(req.Secret) < minWebhookSecretLength {
		return apperr.New("webhook_secret_too_short", "secret must be at least {min} characters", apperr.Params{"min": minWebhookSecretLength})
	}

	if len(req.Events) == 0 {
		return apperr.New("webhook_events_required", "at least one event is required", nil)
	}
	events := make([]models.WebhookEvent, 0, len(req.Events))
	for _, e := range req.Events {
		if !slices.Contains(models.WebhookEvents, e) {
			return apperr.New("webhook_unknown_event", "unknown event {event}", apperr.Params{"event": strconv.Quote(string(e))})
		}
		if !slices.Contains(events, e) {
			events = append(events, e)
		}
	}
	req.Events = events

	return nil
}
