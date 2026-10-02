package webhook

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/webhook/webhooktest"
)

// newTestDispatcher returns a dispatcher with millisecond retries.
func newTestDispatcher(t *testing.T) (*Dispatcher, *database.Repository) {
	t.Helper()

	repo := webhooktest.NewRepository(t)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	d := NewDispatcher(ctx, repo)
	d.retryDelays = []time.Duration{time.Millisecond, time.Millisecond}
	return d, repo
}

type capturedRequest struct {
	header http.Header
	body   []byte
}

// capturingServer answers every request with the next status from statuses
// (repeating the last one) and forwards each request to the returned channel.
func capturingServer(t *testing.T, statuses ...int) (*httptest.Server, <-chan capturedRequest) {
	t.Helper()

	requests := make(chan capturedRequest, 16)
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		requests <- capturedRequest{header: r.Header.Clone(), body: body}

		i := int(calls.Add(1)) - 1
		if i >= len(statuses) {
			i = len(statuses) - 1
		}
		w.WriteHeader(statuses[i])
	}))
	t.Cleanup(srv.Close)
	return srv, requests
}

func receive(t *testing.T, requests <-chan capturedRequest) capturedRequest {
	t.Helper()
	select {
	case req := <-requests:
		return req
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for webhook delivery")
		return capturedRequest{}
	}
}

func assertNoDelivery(t *testing.T, requests <-chan capturedRequest) {
	t.Helper()
	select {
	case req := <-requests:
		t.Fatalf("unexpected delivery: %s", req.body)
	case <-time.After(200 * time.Millisecond):
	}
}

func createWebhook(t *testing.T, repo *database.Repository, url string, active bool, events ...models.WebhookEvent) *models.Webhook {
	t.Helper()
	hook, err := repo.CreateWebhook("test", url, "whsec_test_secret_value", events, active)
	if err != nil {
		t.Fatalf("CreateWebhook() error = %v", err)
	}
	return hook
}

func TestSign(t *testing.T) {
	// Expected value computed independently with:
	//   printf '1700000000.{"event":"message.received"}' | openssl dgst -sha256 -hmac 'whsec_test'
	got := Sign("whsec_test", 1700000000, []byte(`{"event":"message.received"}`))
	want := "sha256=5618156c98e72a18fa973b562ff44de2eca640beaa2b8e040aab1e5e062859e8"
	if got != want {
		t.Errorf("Sign() = %q, want %q", got, want)
	}
}

func TestGenerateSecret(t *testing.T) {
	a, err := GenerateSecret()
	if err != nil {
		t.Fatalf("GenerateSecret() error = %v", err)
	}
	b, _ := GenerateSecret()
	if !strings.HasPrefix(a, "whsec_") || len(a) != len("whsec_")+64 {
		t.Errorf("GenerateSecret() = %q, want whsec_ followed by 64 hex chars", a)
	}
	if a == b {
		t.Error("GenerateSecret() returned the same secret twice")
	}
}

func TestDispatch_SignedDeliveryToSubscribedWebhooks(t *testing.T) {
	d, repo := newTestDispatcher(t)

	target, delivered := capturingServer(t, http.StatusOK)
	other, unexpected := capturingServer(t, http.StatusOK)

	hook := createWebhook(t, repo, target.URL, true, models.EventMessageReceived, models.EventMessageSent)
	createWebhook(t, repo, other.URL, true, models.EventMessageSent)      // not subscribed
	createWebhook(t, repo, other.URL, false, models.EventMessageReceived) // paused

	msg, err := repo.CreateMessage(models.DirectionInbound, "+15551234567", "hello", models.StatusReceived, nil)
	if err != nil {
		t.Fatalf("CreateMessage() error = %v", err)
	}
	d.Dispatch(models.EventMessageReceived, msg)

	req := receive(t, delivered)

	if got := req.header.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	if got := req.header.Get("X-Webhook-Event"); got != string(models.EventMessageReceived) {
		t.Errorf("X-Webhook-Event = %q", got)
	}
	timestamp, err := strconv.ParseInt(req.header.Get("X-Webhook-Timestamp"), 10, 64)
	if err != nil {
		t.Fatalf("X-Webhook-Timestamp: %v", err)
	}
	if got, want := req.header.Get("X-Webhook-Signature"), Sign(hook.Secret, timestamp, req.body); got != want {
		t.Errorf("X-Webhook-Signature = %q, want %q", got, want)
	}

	var payload models.WebhookPayload
	if err := json.Unmarshal(req.body, &payload); err != nil {
		t.Fatalf("decoding payload: %v", err)
	}
	if payload.ID == "" || payload.ID != req.header.Get("X-Webhook-Id") {
		t.Errorf("payload id = %q, X-Webhook-Id = %q", payload.ID, req.header.Get("X-Webhook-Id"))
	}
	if payload.Event != models.EventMessageReceived {
		t.Errorf("payload event = %q", payload.Event)
	}
	if payload.Data == nil || payload.Data.ID != msg.ID || payload.Data.Body != "hello" {
		t.Errorf("payload data = %+v, want message %s", payload.Data, msg.ID)
	}

	assertNoDelivery(t, unexpected)
}

func TestDispatch_RetriesWithSameEventID(t *testing.T) {
	d, repo := newTestDispatcher(t)

	srv, delivered := capturingServer(t, http.StatusInternalServerError, http.StatusOK)
	createWebhook(t, repo, srv.URL, true, models.EventMessageSent)

	d.Dispatch(models.EventMessageSent, &models.Message{ID: "msg-1"})

	first := receive(t, delivered)
	second := receive(t, delivered)
	if first.header.Get("X-Webhook-Id") != second.header.Get("X-Webhook-Id") {
		t.Error("retry used a different X-Webhook-Id")
	}
	assertNoDelivery(t, delivered)
}

func TestDispatch_GivesUpAfterRetries(t *testing.T) {
	d, repo := newTestDispatcher(t)

	srv, delivered := capturingServer(t, http.StatusServiceUnavailable)
	createWebhook(t, repo, srv.URL, true, models.EventMessageFailed)

	d.Dispatch(models.EventMessageFailed, &models.Message{ID: "msg-1"})

	for range len(d.retryDelays) + 1 {
		receive(t, delivered)
	}
	assertNoDelivery(t, delivered)
}

func TestDispatch_DoesNotFollowRedirects(t *testing.T) {
	d, repo := newTestDispatcher(t)

	target, redirected := capturingServer(t, http.StatusOK)
	redirector := httptest.NewServer(http.RedirectHandler(target.URL, http.StatusTemporaryRedirect))
	t.Cleanup(redirector.Close)
	createWebhook(t, repo, redirector.URL, true, models.EventMessageSent)

	d.Dispatch(models.EventMessageSent, &models.Message{ID: "msg-1"})

	assertNoDelivery(t, redirected)
}
