package modem

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

var fastRetryTiming = retryTiming{
	health:   5 * time.Millisecond,
	minDelay: 5 * time.Millisecond,
	maxDelay: 20 * time.Millisecond,
}

// fakeModem stands in for a serial modem. unplug makes every call fail, the
// way a dead serial handle does.
type fakeModem struct {
	mu        sync.Mutex
	down      bool
	closed    bool
	recvCtx   context.Context
	recvStart int
}

func (f *fakeModem) SendSMS(string, string) error { return f.check() }
func (f *fakeModem) CheckStatus() error           { return f.check() }

func (f *fakeModem) GetSignal() (int, error) { return 20, f.check() }

func (f *fakeModem) SendAT(string) (string, error) { return "OK", f.check() }

func (f *fakeModem) StartReceiver(ctx context.Context, _ func(string, string) error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.recvCtx = ctx
	f.recvStart++
}

func (f *fakeModem) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	return nil
}

func (f *fakeModem) check() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.down {
		return errors.New("port gone")
	}
	return nil
}

func (f *fakeModem) unplug() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.down = true
}

func (f *fakeModem) isClosed() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.closed
}

// fakeOpener hands out queued modems and fails while the queue is empty, like
// a missing USB device.
type fakeOpener struct {
	mu    sync.Mutex
	queue []*fakeModem
	opens int
}

func (o *fakeOpener) add(m *fakeModem) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.queue = append(o.queue, m)
}

func (o *fakeOpener) open() (Modem, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.opens++
	if len(o.queue) == 0 {
		return nil, errors.New("no such device")
	}
	m := o.queue[0]
	o.queue = o.queue[1:]
	return m, nil
}

func (o *fakeOpener) openCount() int {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.opens
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestReconnectingModem_StartsWithoutModem(t *testing.T) {
	o := &fakeOpener{}
	w := newReconnectingModem(o.open, fastRetryTiming)
	defer w.Close()

	if err := w.CheckStatus(); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("CheckStatus() error = %v, want ErrNotConnected", err)
	}
	if err := w.SendSMS("+15551234567", "hi"); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("SendSMS() error = %v, want ErrNotConnected", err)
	}
	if _, err := w.SendAT("ATI"); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("SendAT() error = %v, want ErrNotConnected", err)
	}
}

func TestReconnectingModem_ConnectsWhenModemAppears(t *testing.T) {
	o := &fakeOpener{}
	w := newReconnectingModem(o.open, fastRetryTiming)
	defer w.Close()

	o.add(&fakeModem{})

	waitFor(t, "connection", func() bool { return w.CheckStatus() == nil })
}

func TestReconnectingModem_ReconnectsAfterUnplug(t *testing.T) {
	first := &fakeModem{}
	second := &fakeModem{}
	o := &fakeOpener{}
	o.add(first)
	w := newReconnectingModem(o.open, fastRetryTiming)
	defer w.Close()

	if err := w.CheckStatus(); err != nil {
		t.Fatalf("CheckStatus() before unplug error = %v", err)
	}

	first.unplug()
	o.add(second)

	// The unplugged modem fails every call, so a successful call means the
	// connection moved to the new one.
	waitFor(t, "reconnect to the new modem", func() bool {
		_, err := w.SendAT("ATI")
		return err == nil
	})
	if !first.isClosed() {
		t.Error("unresponsive modem was not closed")
	}
}

func TestReconnectingModem_ReceiverFollowsNewConnection(t *testing.T) {
	first := &fakeModem{}
	second := &fakeModem{}
	o := &fakeOpener{}
	o.add(first)
	w := newReconnectingModem(o.open, fastRetryTiming)
	defer w.Close()

	w.StartReceiver(context.Background(), func(string, string) error { return nil })
	first.mu.Lock()
	if first.recvStart != 1 {
		first.mu.Unlock()
		t.Fatalf("receiver starts on first modem = %d, want 1", first.recvStart)
	}
	first.mu.Unlock()

	first.unplug()
	o.add(second)

	waitFor(t, "receiver on the new modem", func() bool {
		second.mu.Lock()
		defer second.mu.Unlock()
		return second.recvStart == 1
	})

	first.mu.Lock()
	defer first.mu.Unlock()
	if first.recvCtx.Err() == nil {
		t.Error("receiver of the unplugged modem was not stopped")
	}
}

func TestReconnectingModem_RetriesOpenWhileMissing(t *testing.T) {
	o := &fakeOpener{}
	w := newReconnectingModem(o.open, fastRetryTiming)
	defer w.Close()

	waitFor(t, "several open attempts", func() bool { return o.openCount() >= 3 })

	o.add(&fakeModem{})
	waitFor(t, "connection", func() bool { return w.CheckStatus() == nil })
}

func TestReconnectingModem_CloseStopsReconnecting(t *testing.T) {
	first := &fakeModem{}
	o := &fakeOpener{}
	o.add(first)
	w := newReconnectingModem(o.open, fastRetryTiming)

	if err := w.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if !first.isClosed() {
		t.Error("connected modem was not closed")
	}

	opens := o.openCount()
	time.Sleep(30 * time.Millisecond)
	if got := o.openCount(); got != opens {
		t.Errorf("open attempts after Close = %d, want none", got-opens)
	}
	if err := w.Close(); err != nil {
		t.Errorf("second Close() error = %v", err)
	}
}
