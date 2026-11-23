package outbox

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
	"github.com/mattboston/sms-gateway/internal/webhook"
	"github.com/mattboston/sms-gateway/internal/webhook/webhooktest"
)

// fakeModem is a modem that can be switched off and back on, and can be told
// to reject messages while on.
type fakeModem struct {
	*modem.MockModem

	mu sync.Mutex
	// state is "on", "unplugged" (no device: ErrNotConnected) or "off" (the
	// device is still open but no longer answers).
	state  string
	reject error
	sent   []string
}

func newFakeModem(state string) *fakeModem {
	return &fakeModem{MockModem: modem.NewMockModem(), state: state}
}

func (f *fakeModem) set(state string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.state = state
}

func (f *fakeModem) SendSMS(_, body string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case f.state == "unplugged":
		return modem.ErrNotConnected
	case f.state == "off":
		return errors.New("part 1/1: waiting for SMS prompt: timeout")
	case f.reject != nil:
		return f.reject
	}
	f.sent = append(f.sent, body)
	return nil
}

func (f *fakeModem) CheckStatus() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch f.state {
	case "unplugged":
		return modem.ErrNotConnected
	case "off":
		return errors.New("modem not responding: timeout")
	}
	return nil
}

func (f *fakeModem) sentBodies() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.sent...)
}

func newTestOutbox(t *testing.T, m modem.Modem, maxAge time.Duration) (*Outbox, *database.Repository) {
	t.Helper()
	repo := webhooktest.NewRepository(t)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	return New(repo, m, webhook.NewDispatcher(ctx, repo), maxAge), repo
}

func createPending(t *testing.T, repo *database.Repository, body string, apiKeyID *string) *models.Message {
	t.Helper()
	msg, err := repo.CreateMessage(models.DirectionOutbound, "+15551234567", body, models.StatusPending, apiKeyID, false)
	if err != nil {
		t.Fatalf("CreateMessage() error = %v", err)
	}
	return msg
}

func statusOf(t *testing.T, repo *database.Repository, id string) models.MessageStatus {
	t.Helper()
	msg, err := repo.GetMessage(id)
	if err != nil {
		t.Fatalf("GetMessage(%s) error = %v", id, err)
	}
	return msg.Status
}

func TestSend_ModemUnavailableQueues(t *testing.T) {
	for _, state := range []string{"unplugged", "off"} {
		t.Run(state, func(t *testing.T) {
			m := newFakeModem(state)
			ob, repo := newTestOutbox(t, m, 0)
			msg := createPending(t, repo, "hello", nil)

			if res := ob.Send(msg); res.Status != models.StatusQueued {
				t.Fatalf("Send() status = %q, want queued", res.Status)
			}
			if got := statusOf(t, repo, msg.ID); got != models.StatusQueued {
				t.Errorf("stored status = %q, want queued", got)
			}

			// Nothing goes out while the modem is still down.
			ob.drain(context.Background())
			if got := statusOf(t, repo, msg.ID); got != models.StatusQueued {
				t.Errorf("status while modem down = %q, want queued", got)
			}

			m.set("on")
			ob.drain(context.Background())
			if got := statusOf(t, repo, msg.ID); got != models.StatusSent {
				t.Errorf("status after modem back = %q, want sent", got)
			}
			if got := m.sentBodies(); len(got) != 1 || got[0] != "hello" {
				t.Errorf("modem sent %v, want [hello]", got)
			}
		})
	}
}

// TestSend_RejectedMessageFails checks a message the modem refuses while it is
// up fails at once instead of waiting in the queue forever.
func TestSend_RejectedMessageFails(t *testing.T) {
	m := newFakeModem("on")
	m.reject = errors.New("AT command error: +CMS ERROR: 330")
	ob, repo := newTestOutbox(t, m, 0)
	msg := createPending(t, repo, "hello", nil)

	res := ob.Send(msg)
	if res.Status != models.StatusFailed {
		t.Fatalf("Send() status = %q, want failed", res.Status)
	}
	if got := statusOf(t, repo, msg.ID); got != models.StatusFailed {
		t.Errorf("stored status = %q, want failed", got)
	}
	if next, _ := repo.NextQueuedMessage(); next != nil {
		t.Errorf("queue holds %s, want empty", next.ID)
	}
}

// TestSend_KeepsQueueOrder checks queued messages go out in the order they
// were sent, and a new message cannot overtake them once the modem is back.
func TestSend_KeepsQueueOrder(t *testing.T) {
	m := newFakeModem("unplugged")
	ob, repo := newTestOutbox(t, m, 0)

	// All created within the same second, which created_at cannot order.
	first := createPending(t, repo, "first", nil)
	second := createPending(t, repo, "second", nil)
	ob.Send(first)
	ob.Send(second)

	m.set("on")
	third := createPending(t, repo, "third", nil)
	if res := ob.Send(third); res.Status != models.StatusQueued {
		t.Fatalf("Send() with a non-empty queue status = %q, want queued", res.Status)
	}

	ob.drain(context.Background())
	got := m.sentBodies()
	want := []string{"first", "second", "third"}
	if len(got) != len(want) {
		t.Fatalf("modem sent %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("modem sent %v, want %v", got, want)
		}
	}
}

// TestDrain_StopsWhenModemDropsAgain checks a modem lost mid-queue leaves the
// rest queued, in place, for the next pass.
func TestDrain_StopsWhenModemDropsAgain(t *testing.T) {
	m := newFakeModem("unplugged")
	ob, repo := newTestOutbox(t, m, 0)
	a := createPending(t, repo, "a", nil)
	b := createPending(t, repo, "b", nil)
	ob.Send(a)
	ob.Send(b)

	// The status check passes, then the device is gone by the time of sending.
	m.set("on")
	m.mu.Lock()
	m.reject = modem.ErrNotConnected
	m.mu.Unlock()
	ob.drain(context.Background())

	for _, msg := range []*models.Message{a, b} {
		if got := statusOf(t, repo, msg.ID); got != models.StatusQueued {
			t.Errorf("message %s status = %q, want queued", msg.Body, got)
		}
	}
	if next, _ := repo.NextQueuedMessage(); next == nil || next.ID != a.ID {
		t.Errorf("front of queue = %v, want %s", next, a.ID)
	}
}

func TestDrain_ExpiresOldMessages(t *testing.T) {
	m := newFakeModem("unplugged")
	ob, repo := newTestOutbox(t, m, time.Hour)
	msg := createPending(t, repo, "stale", nil)
	ob.Send(msg)

	ob.now = func() time.Time { return time.Now().Add(2 * time.Hour) }
	m.set("on")
	ob.drain(context.Background())

	stored, err := repo.GetMessage(msg.ID)
	if err != nil {
		t.Fatalf("GetMessage() error = %v", err)
	}
	if stored.Status != models.StatusFailed || stored.ErrorMessage == nil {
		t.Errorf("stored = %q (error %v), want failed with a reason", stored.Status, stored.ErrorMessage)
	}
	if got := m.sentBodies(); len(got) != 0 {
		t.Errorf("modem sent %v, want nothing", got)
	}
}

// TestSend_CountsQueuedMessageWhenSent checks an API key's usage counter grows
// when its queued message finally goes out, not when it is queued.
func TestSend_CountsQueuedMessageWhenSent(t *testing.T) {
	m := newFakeModem("unplugged")
	ob, repo := newTestOutbox(t, m, 0)
	user, _ := repo.CreateUser("sender", "hash", false, false)
	key, err := repo.CreateAPIKey("key-value", "script", user.ID, false)
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	ob.Send(createPending(t, repo, "hello", &key.ID))

	count := func() int {
		k, err := repo.GetAPIKeyByKey("key-value")
		if err != nil {
			t.Fatalf("GetAPIKeyByKey() error = %v", err)
		}
		return k.SentCount
	}
	if got := count(); got != 0 {
		t.Errorf("sent_count while queued = %d, want 0", got)
	}
	m.set("on")
	ob.drain(context.Background())
	if got := count(); got != 1 {
		t.Errorf("sent_count after send = %d, want 1", got)
	}
}

// TestRun_SendsWhenModemComesBack runs the queue loop end to end.
func TestRun_SendsWhenModemComesBack(t *testing.T) {
	m := newFakeModem("off")
	ob, repo := newTestOutbox(t, m, 0)
	ob.interval = 10 * time.Millisecond
	msg := createPending(t, repo, "hello", nil)
	ob.Send(msg)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		ob.Run(ctx)
		close(done)
	}()
	defer func() {
		cancel()
		<-done
	}()

	time.Sleep(50 * time.Millisecond)
	m.set("on")

	deadline := time.Now().Add(2 * time.Second)
	for statusOf(t, repo, msg.ID) != models.StatusSent {
		if time.Now().After(deadline) {
			t.Fatal("queued message was not sent after the modem came back")
		}
		time.Sleep(10 * time.Millisecond)
	}
}
