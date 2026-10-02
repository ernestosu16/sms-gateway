package api

import (
	"net/http"
	"strings"
)

// maxRequestBodyBytes caps every request body. The largest legitimate body is
// a long SMS, far below this; without a cap an unauthenticated client could
// make the JSON decoder buffer an arbitrarily large login request.
const maxRequestBodyBytes = 1 << 20

// contentSecurityPolicy restricts the embedded web UI to its own scripts and
// styles. Inline styles stay allowed because React renders style attributes.
const contentSecurityPolicy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
	"object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

// securityHeaders sets browser hardening headers on every response. Swagger UI
// relies on inline scripts, so it is served without the Content-Security-Policy.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		if !strings.HasPrefix(r.URL.Path, "/swagger/") {
			h.Set("Content-Security-Policy", contentSecurityPolicy)
		}
		next.ServeHTTP(w, r)
	})
}

// limitRequestBody makes reads past maxRequestBodyBytes fail, which handlers
// report as an invalid request body.
func limitRequestBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
		next.ServeHTTP(w, r)
	})
}
