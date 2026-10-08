package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/mattboston/sms-gateway/internal/models"
)

func loginToken(t *testing.T, h http.Handler, username, password string) string {
	t.Helper()
	w := login(t, h, username, password)
	if w.Code != http.StatusOK {
		t.Fatalf("login %s: status = %d, body %s", username, w.Code, w.Body.String())
	}
	var resp models.LoginResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding login response: %v", err)
	}
	return resp.Token
}

func TestDeleteUser(t *testing.T) {
	const password = "password123"

	t.Run("removes the user and their keys but keeps their messages", func(t *testing.T) {
		h, repo := newAuthTestRouter(t)
		createTestUser(t, repo, "root", password, true, false)
		victim := createTestUser(t, repo, "victim", password, false, false)
		victimToken := loginToken(t, h, "victim", password)
		key, err := repo.CreateAPIKey("victim-key", "label", victim.ID)
		if err != nil {
			t.Fatalf("CreateAPIKey() error = %v", err)
		}
		msg, err := repo.CreateMessage(models.DirectionOutbound, "+15550000000", "hi", models.StatusSent, &key.ID)
		if err != nil {
			t.Fatalf("CreateMessage() error = %v", err)
		}

		token := loginToken(t, h, "root", password)
		if w := doJSON(t, h, http.MethodDelete, "/api/v1/users/"+victim.ID, token, nil); w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (body %s)", w.Code, w.Body.String())
		}

		if _, err := repo.GetUserByID(victim.ID); err == nil {
			t.Error("user still exists after delete")
		}
		if got := findKey(t, repo, key.ID); got != nil {
			t.Error("API key still exists after deleting its user")
		}
		kept, err := repo.GetMessage(msg.ID)
		if err != nil {
			t.Fatalf("message was removed with its user: %v", err)
		}
		if kept.APIKeyID != nil {
			t.Errorf("message api_key_id = %v, want nil", *kept.APIKeyID)
		}
		if w := doJSON(t, h, http.MethodGet, "/api/v1/sms/inbox", victimToken, nil); w.Code != http.StatusUnauthorized {
			t.Errorf("deleted user's token: status = %d, want 401", w.Code)
		}
	})

	t.Run("admins are never deleted", func(t *testing.T) {
		h, repo := newAuthTestRouter(t)
		root := createTestUser(t, repo, "root", password, true, false)
		other := createTestUser(t, repo, "other-admin", password, true, false)
		token := loginToken(t, h, "root", password)

		for _, target := range []*models.User{root, other} {
			w := doJSON(t, h, http.MethodDelete, "/api/v1/users/"+target.ID, token, nil)
			if w.Code != http.StatusForbidden {
				t.Errorf("deleting admin %s: status = %d, want 403", target.Username, w.Code)
			}
			if _, err := repo.GetUserByID(target.ID); err != nil {
				t.Errorf("admin %s was deleted: %v", target.Username, err)
			}
		}
	})

	t.Run("unknown user is 404", func(t *testing.T) {
		h, repo := newAuthTestRouter(t)
		createTestUser(t, repo, "root", password, true, false)
		token := loginToken(t, h, "root", password)

		w := doJSON(t, h, http.MethodDelete, "/api/v1/users/00000000-0000-0000-0000-000000000000", token, nil)
		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want 404", w.Code)
		}
	})

	t.Run("non-admins are forbidden", func(t *testing.T) {
		h, repo := newAuthTestRouter(t)
		createTestUser(t, repo, "plain", password, false, false)
		target := createTestUser(t, repo, "target", password, false, false)
		token := loginToken(t, h, "plain", password)

		w := doJSON(t, h, http.MethodDelete, "/api/v1/users/"+target.ID, token, nil)
		if w.Code != http.StatusForbidden {
			t.Errorf("status = %d, want 403", w.Code)
		}
		if _, err := repo.GetUserByID(target.ID); err != nil {
			t.Errorf("user was deleted by a non-admin: %v", err)
		}
	})
}
