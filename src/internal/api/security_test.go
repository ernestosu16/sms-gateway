package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	h, _ := newAuthTestRouter(t)

	for _, path := range []string{"/", "/api/v1/health", "/swagger/index.html"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))

		for header, want := range map[string]string{
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options":        "DENY",
			"Referrer-Policy":        "no-referrer",
		} {
			if got := w.Header().Get(header); got != want {
				t.Errorf("GET %s %s = %q, want %q", path, header, got, want)
			}
		}

		csp := w.Header().Get("Content-Security-Policy")
		if strings.HasPrefix(path, "/swagger/") {
			if csp != "" {
				t.Errorf("GET %s has CSP %q, want none so Swagger UI's inline scripts run", path, csp)
			}
		} else if csp != contentSecurityPolicy {
			t.Errorf("GET %s CSP = %q, want %q", path, csp, contentSecurityPolicy)
		}
	}
}

func TestOversizedRequestBodyIsRejected(t *testing.T) {
	h, _ := newAuthTestRouter(t)

	// A syntactically valid login whose password alone exceeds the cap.
	body := `{"username":"admin","password":"` + strings.Repeat("a", maxRequestBodyBytes) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("oversized login status = %d, want 400", w.Code)
	}
}
