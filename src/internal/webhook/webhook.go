// Package webhook signs message events and delivers them to registered
// webhook URLs.
package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"slices"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
)

const (
	// secretPrefix marks generated secrets so they are recognizable in configs.
	secretPrefix = "whsec_"

	// requestTimeout bounds a single delivery attempt, including reading the
	// response, so a hanging endpoint cannot pin a goroutine forever.
	requestTimeout = 10 * time.Second

	// maxResponseBytes caps how much of a response body is drained. The body is
	// never used; draining only lets the connection be reused.
	maxResponseBytes = 64 << 10
)

// GenerateSecret returns a new random signing secret.
func GenerateSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating webhook secret: %w", err)
	}
	return secretPrefix + hex.EncodeToString(b), nil
}

// Sign returns the X-Webhook-Signature header value for a delivery: "sha256="
// followed by the hex HMAC-SHA256 of "<timestamp>.<body>" keyed with secret.
//
// The timestamp is part of the signed content so a receiver that rejects stale
// timestamps also rejects replayed deliveries.
func Sign(secret string, timestamp int64, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(timestamp, 10) + "."))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// Dispatcher delivers message events to webhooks in the background.
//
// Deliveries live only in memory: anything still pending when the context is
// cancelled (for example on shutdown) is dropped, not persisted.
type Dispatcher struct {
	ctx    context.Context
	repo   *database.Repository
	client *http.Client

	// retryDelays is the wait before each retry, so a delivery is attempted at
	// most len(retryDelays)+1 times. It is a field so tests can shorten it.
	retryDelays []time.Duration
}

// NewDispatcher creates a Dispatcher whose deliveries stop when ctx is done.
func NewDispatcher(ctx context.Context, repo *database.Repository) *Dispatcher {
	return &Dispatcher{
		ctx:  ctx,
		repo: repo,
		client: &http.Client{
			Timeout:   requestTimeout,
			Transport: newTransport(),
			// Following a redirect would send the signed payload to a URL the
			// admin never configured, so a 3xx counts as a failed delivery.
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		retryDelays: []time.Duration{5 * time.Second, 30 * time.Second, 2 * time.Minute},
	}
}

// Dispatch notifies every active webhook subscribed to event about msg.
//
// It returns immediately. The webhook lookup and every delivery run in
// background goroutines, so a slow or unreachable endpoint never stalls modem
// polling or an API response.
func (d *Dispatcher) Dispatch(event models.WebhookEvent, msg *models.Message) {
	snapshot := *msg
	go d.dispatch(event, &snapshot)
}

func (d *Dispatcher) dispatch(event models.WebhookEvent, msg *models.Message) {
	hooks, err := d.repo.ListActiveWebhooks()
	if err != nil {
		log.Printf("webhooks: loading webhooks for %s: %v", event, err)
		return
	}

	var targets []models.Webhook
	for _, h := range hooks {
		if slices.Contains(h.Events, event) {
			targets = append(targets, h)
		}
	}
	if len(targets) == 0 {
		return
	}

	// One payload per event, shared by every webhook and every retry, so the
	// event id is stable and receivers can discard duplicates.
	payload := models.WebhookPayload{
		ID:        uuid.New().String(),
		Event:     event,
		CreatedAt: time.Now().UTC(),
		Data:      msg,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("webhooks: encoding %s payload: %v", event, err)
		return
	}

	for _, h := range targets {
		go d.deliver(h, payload, body)
	}
}

// deliver sends body to hook, retrying failed attempts after each retry delay.
func (d *Dispatcher) deliver(hook models.Webhook, payload models.WebhookPayload, body []byte) {
	for attempt := 0; ; attempt++ {
		err := d.send(hook, payload, body)
		if err == nil {
			return
		}

		if attempt >= len(d.retryDelays) {
			log.Printf("webhooks: giving up on %s event %s for webhook %q (%s) after %d attempts: %v",
				payload.Event, payload.ID, hook.Name, hook.ID, attempt+1, err)
			return
		}

		delay := d.retryDelays[attempt]
		log.Printf("webhooks: %s event %s for webhook %q (%s) failed on attempt %d, retrying in %s: %v",
			payload.Event, payload.ID, hook.Name, hook.ID, attempt+1, delay, err)

		select {
		case <-d.ctx.Done():
			return
		case <-time.After(delay):
		}
	}
}

// send performs one delivery attempt. Only a 2xx response counts as success.
func (d *Dispatcher) send(hook models.Webhook, payload models.WebhookPayload, body []byte) error {
	req, err := http.NewRequestWithContext(d.ctx, http.MethodPost, hook.URL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("building request: %w", err)
	}

	// Signed per attempt, so a retry carries a fresh timestamp and is not
	// rejected by a receiver's replay window.
	timestamp := time.Now().Unix()
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "sms-gateway-webhook")
	req.Header.Set("X-Webhook-Id", payload.ID)
	req.Header.Set("X-Webhook-Event", string(payload.Event))
	req.Header.Set("X-Webhook-Timestamp", strconv.FormatInt(timestamp, 10))
	req.Header.Set("X-Webhook-Signature", Sign(hook.Secret, timestamp, body))

	resp, err := d.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxResponseBytes))

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return nil
}
