package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
)

// keyRequest builds a DELETE for the API key id as userID, with the chi URL
// parameter set the way the router would.
func keyRequest(id, userID string, isAdmin bool) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/apikeys/"+id, nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	return withClaims(req, userID, isAdmin)
}

// findKey returns the stored key with id, or nil when it no longer exists.
func findKey(t *testing.T, repo *database.Repository, id string) *models.APIKey {
	t.Helper()
	keys, err := repo.ListAPIKeys(database.ListOptions{})
	if err != nil {
		t.Fatalf("ListAPIKeys() error = %v", err)
	}
	for _, k := range keys {
		if k.ID == id {
			return &k
		}
	}
	return nil
}

func TestHandleChangeAPIKeyOwnership(t *testing.T) {
	handlers := map[string]func(*KeyHandler) http.HandlerFunc{
		"deactivate": func(h *KeyHandler) http.HandlerFunc { return h.HandleDeactivateAPIKey },
		"delete":     func(h *KeyHandler) http.HandlerFunc { return h.HandleDeleteAPIKey },
	}

	tests := []struct {
		name      string
		actor     string // "owner", "other" or "admin"
		missingID bool
		wantCode  int
	}{
		{name: "owner", actor: "owner", wantCode: http.StatusOK},
		{name: "admin manages any key", actor: "admin", wantCode: http.StatusOK},
		{name: "another user gets 404", actor: "other", wantCode: http.StatusNotFound},
		{name: "unknown key gets 404", actor: "owner", missingID: true, wantCode: http.StatusNotFound},
	}

	for action, handlerFor := range handlers {
		for _, tt := range tests {
			t.Run(action+"/"+tt.name, func(t *testing.T) {
				repo := newListTestRepo(t)
				h := NewKeyHandler(repo)

				owner, _ := repo.CreateUser("owner", "hash", false, false)
				other, _ := repo.CreateUser("other", "hash", false, false)
				admin, _ := repo.CreateUser("admin", "hash", true, false)
				key, err := repo.CreateAPIKey("owner-key", "label", owner.ID)
				if err != nil {
					t.Fatalf("CreateAPIKey() error = %v", err)
				}

				actors := map[string]*models.User{"owner": owner, "other": other, "admin": admin}
				id := key.ID
				if tt.missingID {
					id = "00000000-0000-0000-0000-000000000000"
				}

				w := httptest.NewRecorder()
				handlerFor(h)(w, keyRequest(id, actors[tt.actor].ID, actors[tt.actor].IsAdmin))
				if w.Code != tt.wantCode {
					t.Fatalf("status = %d, want %d (body %s)", w.Code, tt.wantCode, w.Body.String())
				}

				stored := findKey(t, repo, key.ID)
				changed := stored == nil || !stored.IsActive
				if wantChanged := tt.wantCode == http.StatusOK; changed != wantChanged {
					t.Errorf("key changed = %v, want %v", changed, wantChanged)
				}
			})
		}
	}
}
