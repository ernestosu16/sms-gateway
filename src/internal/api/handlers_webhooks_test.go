package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/mattboston/sms-gateway/internal/auth"
	"github.com/mattboston/sms-gateway/internal/config"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
	"github.com/mattboston/sms-gateway/internal/webhook"
)

// withURLParam attaches a chi route parameter the way the router does, so
// handlers can be called directly.
func withURLParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func decodeWebhook(t *testing.T, w *httptest.ResponseRecorder) models.Webhook {
	t.Helper()
	var hook models.Webhook
	if err := json.NewDecoder(w.Body).Decode(&hook); err != nil {
		t.Fatalf("decoding webhook: %v", err)
	}
	return hook
}

func createTestWebhook(t *testing.T, handler *WebhookHandler, body string) models.Webhook {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks", strings.NewReader(body))
	w := httptest.NewRecorder()
	handler.HandleCreateWebhook(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", w.Code, w.Body.String())
	}
	return decodeWebhook(t, w)
}

func TestHandleCreateWebhook_Validation(t *testing.T) {
	handler := NewWebhookHandler(newListTestRepo(t))

	tests := []struct {
		name string
		body string
	}{
		{"invalid json", `{`},
		{"missing name", `{"name":"  ","url":"https://example.com","events":["message.received"]}`},
		{"name too long", `{"name":"` + strings.Repeat("a", 101) + `","url":"https://example.com","events":["message.received"]}`},
		{"relative url", `{"name":"a","url":"/hook","events":["message.received"]}`},
		{"unsupported scheme", `{"name":"a","url":"ftp://example.com","events":["message.received"]}`},
		{"missing host", `{"name":"a","url":"https://","events":["message.received"]}`},
		{"cloud metadata IP", `{"name":"a","url":"http://169.254.169.254/latest/meta-data/","events":["message.received"]}`},
		{"IPv6 link-local", `{"name":"a","url":"http://[fe80::1]/hook","events":["message.received"]}`},
		{"no events", `{"name":"a","url":"https://example.com","events":[]}`},
		{"unknown event", `{"name":"a","url":"https://example.com","events":["message.deleted"]}`},
		{"short secret", `{"name":"a","url":"https://example.com","secret":"short","events":["message.sent"]}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks", strings.NewReader(tt.body))
			w := httptest.NewRecorder()
			handler.HandleCreateWebhook(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d (body %s)", w.Code, http.StatusBadRequest, w.Body.String())
			}
		})
	}
}

func TestHandleCreateWebhook_Defaults(t *testing.T) {
	handler := NewWebhookHandler(newListTestRepo(t))

	hook := createTestWebhook(t, handler,
		`{"name":" CRM ","url":" https://example.com/hook ","events":["message.received","message.received","message.sent"]}`)

	if hook.Name != "CRM" || hook.URL != "https://example.com/hook" {
		t.Errorf("name/url not trimmed: %q %q", hook.Name, hook.URL)
	}
	if !strings.HasPrefix(hook.Secret, "whsec_") {
		t.Errorf("secret = %q, want a generated whsec_ secret", hook.Secret)
	}
	if !hook.IsActive {
		t.Error("webhook should default to active")
	}
	want := []models.WebhookEvent{models.EventMessageReceived, models.EventMessageSent}
	if !slices.Equal(hook.Events, want) {
		t.Errorf("events = %v, want %v", hook.Events, want)
	}
}

func TestHandleUpdateWebhook(t *testing.T) {
	handler := NewWebhookHandler(newListTestRepo(t))
	created := createTestWebhook(t, handler,
		`{"name":"CRM","url":"https://example.com/hook","secret":"my-own-secret-value","events":["message.received"]}`)

	body := `{"name":"CRM v2","url":"https://example.com/v2","secret":"","events":["message.failed"],"is_active":false}`
	req := withURLParam(httptest.NewRequest(http.MethodPut, "/api/v1/webhooks/"+created.ID, strings.NewReader(body)), "id", created.ID)
	w := httptest.NewRecorder()
	handler.HandleUpdateWebhook(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	updated := decodeWebhook(t, w)
	if updated.Name != "CRM v2" || updated.URL != "https://example.com/v2" || updated.IsActive {
		t.Errorf("updated = %+v", updated)
	}
	if updated.Secret != "my-own-secret-value" {
		t.Errorf("secret = %q, want the original secret kept", updated.Secret)
	}
	if !slices.Equal(updated.Events, []models.WebhookEvent{models.EventMessageFailed}) {
		t.Errorf("events = %v", updated.Events)
	}

	// Omitting is_active keeps the paused state.
	body = `{"name":"CRM v2","url":"https://example.com/v2","events":["message.failed"]}`
	req = withURLParam(httptest.NewRequest(http.MethodPut, "/api/v1/webhooks/"+created.ID, strings.NewReader(body)), "id", created.ID)
	w = httptest.NewRecorder()
	handler.HandleUpdateWebhook(w, req)
	if got := decodeWebhook(t, w); got.IsActive {
		t.Error("omitting is_active should keep the webhook paused")
	}
}

func TestHandleWebhook_NotFound(t *testing.T) {
	handler := NewWebhookHandler(newListTestRepo(t))

	body := `{"name":"a","url":"https://example.com","events":["message.sent"]}`
	req := withURLParam(httptest.NewRequest(http.MethodPut, "/api/v1/webhooks/missing", strings.NewReader(body)), "id", "missing")
	w := httptest.NewRecorder()
	handler.HandleUpdateWebhook(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("update status = %d, want %d", w.Code, http.StatusNotFound)
	}

	req = withURLParam(httptest.NewRequest(http.MethodDelete, "/api/v1/webhooks/missing", nil), "id", "missing")
	w = httptest.NewRecorder()
	handler.HandleDeleteWebhook(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("delete status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestHandleDeleteWebhook(t *testing.T) {
	repo := newListTestRepo(t)
	handler := NewWebhookHandler(repo)
	created := createTestWebhook(t, handler, `{"name":"a","url":"https://example.com","events":["message.sent"]}`)

	req := withURLParam(httptest.NewRequest(http.MethodDelete, "/api/v1/webhooks/"+created.ID, nil), "id", created.ID)
	w := httptest.NewRecorder()
	handler.HandleDeleteWebhook(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if total, _ := repo.CountWebhooks(); total != 0 {
		t.Errorf("CountWebhooks() = %d after delete, want 0", total)
	}
}

func TestHandleListWebhooks_Pagination(t *testing.T) {
	handler := NewWebhookHandler(newListTestRepo(t))
	for range 3 {
		createTestWebhook(t, handler, `{"name":"a","url":"https://example.com","events":["message.sent"]}`)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/webhooks?limit=2", nil)
	w := httptest.NewRecorder()
	handler.HandleListWebhooks(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if got := totalHeader(t, w); got != "3" {
		t.Errorf("X-Total-Count = %q, want 3", got)
	}
	var hooks []models.Webhook
	if err := json.NewDecoder(w.Body).Decode(&hooks); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if len(hooks) != 2 {
		t.Errorf("got %d webhooks, want 2", len(hooks))
	}
}

func TestWebhookRoutes_RequireAdmin(t *testing.T) {
	repo := newListTestRepo(t)
	cfg := &config.Config{JWTSecret: "test-secret"}
	router := NewRouter(repo, modem.NewMockModem(), webhook.NewDispatcher(context.Background(), repo), cfg)

	tests := []struct {
		name    string
		isAdmin bool
		want    int
	}{
		{"non-admin is forbidden", false, http.StatusForbidden},
		{"admin is allowed", true, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Admin rights come from the stored user, not the token claim.
			user, err := repo.CreateUser(tt.name, "hash", tt.isAdmin, false)
			if err != nil {
				t.Fatalf("CreateUser() error = %v", err)
			}
			token, err := auth.GenerateJWT(cfg.JWTSecret, user.ID, tt.isAdmin)
			if err != nil {
				t.Fatalf("GenerateJWT() error = %v", err)
			}
			req := httptest.NewRequest(http.MethodGet, "/api/v1/webhooks", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tt.want {
				t.Errorf("status = %d, want %d", w.Code, tt.want)
			}
		})
	}
}
