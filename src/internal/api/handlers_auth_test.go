package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mattboston/sms-gateway/internal/auth"
	"github.com/mattboston/sms-gateway/internal/config"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
	"github.com/mattboston/sms-gateway/internal/webhook"
)

var testJWTSecret = strings.Repeat("k", 32)

func newAuthTestRouter(t *testing.T) (http.Handler, *database.Repository) {
	t.Helper()
	repo := newListTestRepo(t)
	webhooks := webhook.NewDispatcher(t.Context(), repo)
	return NewRouter(repo, modem.NewMockModem(), webhooks, &config.Config{JWTSecret: testJWTSecret}), repo
}

func createTestUser(t *testing.T, repo *database.Repository, username, password string, isAdmin, mustChange bool) *models.User {
	t.Helper()
	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatalf("hashing password: %v", err)
	}
	user, err := repo.CreateUser(username, hash, isAdmin, mustChange)
	if err != nil {
		t.Fatalf("CreateUser() error = %v", err)
	}
	return user
}

func doJSON(t *testing.T, h http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encoding body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func login(t *testing.T, h http.Handler, username, password string) *httptest.ResponseRecorder {
	t.Helper()
	return doJSON(t, h, http.MethodPost, "/api/v1/auth/login", "", models.LoginRequest{Username: username, Password: password})
}

func TestMustChangePasswordIsEnforcedByAPI(t *testing.T) {
	h, repo := newAuthTestRouter(t)
	createTestUser(t, repo, "admin", "initial-password", true, true)

	w := login(t, h, "admin", "initial-password")
	if w.Code != http.StatusOK {
		t.Fatalf("login status = %d, want 200", w.Code)
	}
	var resp models.LoginResponse
	_ = json.NewDecoder(w.Body).Decode(&resp)

	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/api/v1/sms/inbox"},
		{http.MethodGet, "/api/v1/apikeys"},
		{http.MethodGet, "/api/v1/users"},
	} {
		if got := doJSON(t, h, route.method, route.path, resp.Token, nil).Code; got != http.StatusForbidden {
			t.Errorf("%s %s before password change = %d, want 403", route.method, route.path, got)
		}
	}

	change := models.ChangePasswordRequest{CurrentPassword: "initial-password", NewPassword: "a-new-password"}
	w = doJSON(t, h, http.MethodPost, "/api/v1/auth/change-password", resp.Token, change)
	if w.Code != http.StatusOK {
		t.Fatalf("change-password status = %d, want 200", w.Code)
	}
	var changed models.ChangePasswordResponse
	_ = json.NewDecoder(w.Body).Decode(&changed)

	if got := doJSON(t, h, http.MethodGet, "/api/v1/sms/inbox", changed.Token, nil).Code; got != http.StatusOK {
		t.Errorf("GET /api/v1/sms/inbox after password change = %d, want 200", got)
	}
}

func TestJWTPrivilegesComeFromDatabase(t *testing.T) {
	h, repo := newAuthTestRouter(t)
	user := createTestUser(t, repo, "regular", "regular-password", false, false)

	// A token claiming admin for a non-admin user must not grant admin routes.
	forged, _ := auth.GenerateJWT(testJWTSecret, user.ID, true, 0)
	if got := doJSON(t, h, http.MethodGet, "/api/v1/users", forged, nil).Code; got != http.StatusForbidden {
		t.Errorf("admin route with stale admin claim = %d, want 403", got)
	}

	// A token for a user that does not exist is rejected outright.
	ghost, _ := auth.GenerateJWT(testJWTSecret, "no-such-user", true, 0)
	for _, path := range []string{"/api/v1/users", "/api/v1/sms/inbox", "/api/v1/apikeys"} {
		if got := doJSON(t, h, http.MethodGet, path, ghost, nil).Code; got != http.StatusUnauthorized {
			t.Errorf("GET %s with token for missing user = %d, want 401", path, got)
		}
	}
}

func TestLoginIsThrottledPerUsername(t *testing.T) {
	h, repo := newAuthTestRouter(t)
	createTestUser(t, repo, "admin", "correct-password", true, false)

	for i := 0; i < maxFailedLogins; i++ {
		if got := login(t, h, "admin", "wrong").Code; got != http.StatusUnauthorized {
			t.Fatalf("failed login %d status = %d, want 401", i+1, got)
		}
	}

	w := login(t, h, "admin", "correct-password")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("login after %d failures = %d, want 429 even with the right password", maxFailedLogins, w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Error("429 response is missing Retry-After")
	}

	// Unknown usernames are throttled the same way, so 429 does not reveal
	// which usernames exist.
	for i := 0; i < maxFailedLogins; i++ {
		login(t, h, "nobody", "wrong")
	}
	if got := login(t, h, "nobody", "wrong").Code; got != http.StatusTooManyRequests {
		t.Errorf("unknown username after %d failures = %d, want 429", maxFailedLogins, got)
	}
}

func TestPasswordsMustMeetMinimumLength(t *testing.T) {
	h, repo := newAuthTestRouter(t)
	createTestUser(t, repo, "admin", "admin-password", true, false)

	var resp models.LoginResponse
	_ = json.NewDecoder(login(t, h, "admin", "admin-password").Body).Decode(&resp)

	change := models.ChangePasswordRequest{CurrentPassword: "admin-password", NewPassword: "short"}
	if got := doJSON(t, h, http.MethodPost, "/api/v1/auth/change-password", resp.Token, change).Code; got != http.StatusBadRequest {
		t.Errorf("change-password to a short password = %d, want 400", got)
	}

	create := models.CreateUserRequest{Username: "new", Password: "short"}
	if got := doJSON(t, h, http.MethodPost, "/api/v1/users", resp.Token, create).Code; got != http.StatusBadRequest {
		t.Errorf("create user with a short password = %d, want 400", got)
	}
}

func TestLogoutRevokesTokens(t *testing.T) {
	h, repo := newAuthTestRouter(t)
	createTestUser(t, repo, "regular", "regular-password", false, false)

	var first, second models.LoginResponse
	_ = json.NewDecoder(login(t, h, "regular", "regular-password").Body).Decode(&first)
	_ = json.NewDecoder(login(t, h, "regular", "regular-password").Body).Decode(&second)

	if got := doJSON(t, h, http.MethodPost, "/api/v1/auth/logout", first.Token, nil).Code; got != http.StatusOK {
		t.Fatalf("logout status = %d, want 200", got)
	}
	for name, token := range map[string]string{"logged-out token": first.Token, "other session": second.Token} {
		if got := doJSON(t, h, http.MethodGet, "/api/v1/sms/inbox", token, nil).Code; got != http.StatusUnauthorized {
			t.Errorf("%s after logout = %d, want 401", name, got)
		}
	}

	var again models.LoginResponse
	_ = json.NewDecoder(login(t, h, "regular", "regular-password").Body).Decode(&again)
	if got := doJSON(t, h, http.MethodGet, "/api/v1/sms/inbox", again.Token, nil).Code; got != http.StatusOK {
		t.Errorf("new login after logout = %d, want 200", got)
	}
}

func TestChangePasswordRevokesOtherTokens(t *testing.T) {
	h, repo := newAuthTestRouter(t)
	createTestUser(t, repo, "regular", "old-password", false, false)

	var mine, stolen models.LoginResponse
	_ = json.NewDecoder(login(t, h, "regular", "old-password").Body).Decode(&mine)
	_ = json.NewDecoder(login(t, h, "regular", "old-password").Body).Decode(&stolen)

	change := models.ChangePasswordRequest{CurrentPassword: "old-password", NewPassword: "new-password"}
	w := doJSON(t, h, http.MethodPost, "/api/v1/auth/change-password", mine.Token, change)
	if w.Code != http.StatusOK {
		t.Fatalf("change-password status = %d, want 200", w.Code)
	}
	var resp models.ChangePasswordResponse
	_ = json.NewDecoder(w.Body).Decode(&resp)

	if got := doJSON(t, h, http.MethodGet, "/api/v1/sms/inbox", stolen.Token, nil).Code; got != http.StatusUnauthorized {
		t.Errorf("token issued before the change = %d, want 401", got)
	}
	if got := doJSON(t, h, http.MethodGet, "/api/v1/sms/inbox", resp.Token, nil).Code; got != http.StatusOK {
		t.Errorf("token returned by change-password = %d, want 200", got)
	}
}

func TestLoginDoesNotSetCookieAndCookieIsIgnored(t *testing.T) {
	h, repo := newAuthTestRouter(t)
	createTestUser(t, repo, "regular", "regular-password", false, false)

	w := login(t, h, "regular", "regular-password")
	if cookies := w.Result().Cookies(); len(cookies) != 0 {
		t.Errorf("login set cookies %v, want none", cookies)
	}
	var resp models.LoginResponse
	_ = json.NewDecoder(w.Body).Decode(&resp)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sms/inbox", nil)
	req.AddCookie(&http.Cookie{Name: "token", Value: resp.Token})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("request authenticated only by cookie = %d, want 401", rec.Code)
	}
}
