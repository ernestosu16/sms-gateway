// Package outbox hands outbound SMS to the modem and holds them in a queue
// while the modem is unavailable.
//
// A message the modem rejects while it is up (a bad number, no credit, +CMS
// ERROR) fails at once, as before. A message that cannot be handed over
// because the modem is unplugged, powered off or not responding is stored as
// "queued" instead, and sent in order once the modem answers again. The queue
// lives in the database, so it survives restarts.
package outbox

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
	"github.com/mattboston/sms-gateway/internal/webhook"
)

// DefaultMaxAge is how long a message may wait in the queue before it is
// given up on, so an SMS is not sent days after it stopped being relevant.
const DefaultMaxAge = 24 * time.Hour

// defaultInterval is how often the queue checks whether the modem is back.
const defaultInterval = 5 * time.Second

// Result is the outcome of handing one message to the outbox.
type Result struct {
	Status models.MessageStatus
	// Error is why the message failed, or why it is waiting in the queue.
	Error string
}

// Outbox sends outbound messages through the modem, queueing them while the
// modem is down.
type Outbox struct {
	repo     *database.Repository
	modem    modem.Modem
	webhooks *webhook.Dispatcher
	maxAge   time.Duration
	interval time.Duration
	now      func() time.Time

	// mu is held for every hand-over to the modem, so queued messages go out
	// in order and a new message cannot overtake them.
	mu   sync.Mutex
	wake chan struct{}
}

// New returns an Outbox. A maxAge of zero keeps queued messages until the
// modem comes back, however long that takes. Call Run to start the queue.
func New(repo *database.Repository, m modem.Modem, webhooks *webhook.Dispatcher, maxAge time.Duration) *Outbox {
	return &Outbox{
		repo:     repo,
		modem:    m,
		webhooks: webhooks,
		maxAge:   maxAge,
		interval: defaultInterval,
		now:      time.Now,
		wake:     make(chan struct{}, 1),
	}
}

// Send hands msg, already stored as pending, to the modem and records the
// outcome. When the modem is down, or busy with the queue, msg is queued and
// sent later by Run; it never waits behind other messages, so an HTTP request
// returns promptly however long the queue is.
func (o *Outbox) Send(msg *models.Message) Result {
	if !o.mu.TryLock() {
		return o.enqueue(msg, "")
	}
	defer o.mu.Unlock()

	// Queued messages go first, so a message sent now must wait its turn.
	next, err := o.repo.NextQueuedMessage()
	if err != nil {
		log.Printf("outbox: checking queue: %v", err)
	}
	if next != nil {
		return o.enqueue(msg, "")
	}
	return o.attempt(msg)
}

// Simulate records msg as sent without reaching the modem, for test API keys.
func (o *Outbox) Simulate(msg *models.Message) Result {
	return o.markSent(msg)
}

// Run sends queued messages whenever the modem is available, until ctx ends.
func (o *Outbox) Run(ctx context.Context) {
	ticker := time.NewTicker(o.interval)
	defer ticker.Stop()

	for {
		o.drain(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-o.wake:
		}
	}
}

// drain sends queued messages oldest first and gives up on expired ones. It
// stops at the first message the modem cannot take, leaving the rest queued.
func (o *Outbox) drain(ctx context.Context) {
	o.mu.Lock()
	defer o.mu.Unlock()

	modemChecked := false
	for ctx.Err() == nil {
		msg, err := o.repo.NextQueuedMessage()
		if err != nil {
			log.Printf("outbox: reading queue: %v", err)
			return
		}
		if msg == nil {
			return
		}

		if o.expired(msg) {
			o.markFailed(msg, fmt.Sprintf("modem unavailable for %s; message expired in queue", o.maxAge))
			continue
		}

		// One status check per pass: it spares an attempt per message while
		// the modem is down, and attempt itself notices if it drops mid-pass.
		if !modemChecked {
			if err := o.modem.CheckStatus(); err != nil {
				return
			}
			modemChecked = true
		}

		if res := o.attempt(msg); res.Status == models.StatusQueued {
			return
		}
	}
}

// attempt hands msg to the modem and records the outcome. The caller holds mu.
func (o *Outbox) attempt(msg *models.Message) Result {
	err := o.modem.SendSMS(msg.PhoneNumber, msg.Body)
	if err == nil {
		return o.markSent(msg)
	}
	if o.modemDown(err) {
		return o.enqueue(msg, err.Error())
	}
	return o.markFailed(msg, err.Error())
}

// modemDown reports whether a send failed because the modem is unavailable,
// rather than because it refused this message.
//
// A failed send is followed by a status check: a modem that was switched off
// mid-send no longer answers it, while one that answered +CMS ERROR still does.
func (o *Outbox) modemDown(sendErr error) bool {
	if errors.Is(sendErr, modem.ErrNotConnected) {
		return true
	}
	return o.modem.CheckStatus() != nil
}

func (o *Outbox) expired(msg *models.Message) bool {
	return o.maxAge > 0 && o.now().Sub(msg.CreatedAt) > o.maxAge
}

// enqueue stores msg as queued and wakes Run. reason, when set, records why
// the last attempt did not go through.
func (o *Outbox) enqueue(msg *models.Message, reason string) Result {
	if msg.Status != models.StatusQueued {
		log.Printf("outbox: modem unavailable, queued message %s", msg.ID)
	}
	if err := o.repo.QueueMessage(msg.ID, optional(reason)); err != nil {
		log.Printf("outbox: queueing message %s: %v", msg.ID, err)
	}
	select {
	case o.wake <- struct{}{}:
	default:
	}
	return Result{Status: models.StatusQueued, Error: reason}
}

func (o *Outbox) markSent(msg *models.Message) Result {
	if err := o.repo.UpdateMessageStatus(msg.ID, models.StatusSent, nil, nil); err != nil {
		log.Printf("outbox: marking message %s sent: %v", msg.ID, err)
	}
	// The message is already out, so a failure to count it is only logged.
	if msg.APIKeyID != nil {
		if err := o.repo.IncrementAPIKeySentCount(*msg.APIKeyID); err != nil {
			log.Printf("api keys: counting sent message for key %s: %v", *msg.APIKeyID, err)
		}
	}
	o.notify(models.EventMessageSent, msg.ID)
	return Result{Status: models.StatusSent}
}

func (o *Outbox) markFailed(msg *models.Message, reason string) Result {
	if err := o.repo.UpdateMessageStatus(msg.ID, models.StatusFailed, nil, &reason); err != nil {
		log.Printf("outbox: marking message %s failed: %v", msg.ID, err)
	}
	o.notify(models.EventMessageFailed, msg.ID)
	return Result{Status: models.StatusFailed, Error: reason}
}

// notify sends event to webhooks with the message as stored after its final
// status update, so the payload carries the status and error the event reports.
func (o *Outbox) notify(event models.WebhookEvent, messageID string) {
	msg, err := o.repo.GetMessage(messageID)
	if err != nil {
		log.Printf("webhooks: loading message %s for %s: %v", messageID, event, err)
		return
	}
	o.webhooks.Dispatch(event, msg)
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
