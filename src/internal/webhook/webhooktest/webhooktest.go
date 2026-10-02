// Package webhooktest provides helpers for tests that exercise webhook
// deliveries end to end.
package webhooktest

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	smsgateway "github.com/mattboston/sms-gateway"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
)

// NewRepository returns a repository over a migrated SQLite file.
//
// A file is used instead of :memory: because deliveries run on other
// goroutines, and every new connection to :memory: sees an empty database.
func NewRepository(t testing.TB) *database.Repository {
	t.Helper()

	db, err := database.New("sqlite", filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("opening test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if err := database.RunMigrations(db, "sqlite", smsgateway.MigrationsFS); err != nil {
		t.Fatalf("running migrations: %v", err)
	}
	return database.NewRepository(db)
}

// Delivery is one request received by a Receiver.
type Delivery struct {
	Header  http.Header
	Body    []byte
	Payload models.WebhookPayload
}

// Receiver is an HTTP server that records every delivery and answers 204.
type Receiver struct {
	URL        string
	deliveries chan Delivery
}

// NewReceiver starts a Receiver that is shut down when the test ends.
func NewReceiver(t testing.TB) *Receiver {
	t.Helper()

	r := &Receiver{deliveries: make(chan Delivery, 16)}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		d := Delivery{Header: req.Header.Clone(), Body: body}
		_ = json.Unmarshal(body, &d.Payload)
		r.deliveries <- d
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	r.URL = srv.URL
	return r
}

// ExpectNone fails the test if a delivery arrives within wait.
func (r *Receiver) ExpectNone(t testing.TB, wait time.Duration) {
	t.Helper()
	select {
	case d := <-r.deliveries:
		t.Fatalf("unexpected webhook delivery: %s", d.Body)
	case <-time.After(wait):
	}
}

// Next waits up to five seconds for the next delivery.
func (r *Receiver) Next(t testing.TB) Delivery {
	t.Helper()
	select {
	case d := <-r.deliveries:
		return d
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for webhook delivery")
		return Delivery{}
	}
}
