package modem

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"
)

// ErrNotConnected is returned while no modem is connected, for example when
// the USB modem is unplugged or has not been found yet.
var ErrNotConnected = errors.New("modem not connected")

// retryTiming controls how often a ReconnectingModem checks the connection and
// how long it waits between attempts to open a modem that is missing.
type retryTiming struct {
	health   time.Duration // interval between checks while connected
	minDelay time.Duration // first wait after losing the modem
	maxDelay time.Duration // longest wait between attempts to open it
}

var defaultRetryTiming = retryTiming{
	health:   5 * time.Second,
	minDelay: 2 * time.Second,
	maxDelay: 30 * time.Second,
}

// ReconnectingModem keeps a serial modem usable across unplugs. It opens the
// modem with open and checks it every few seconds. When the modem stops
// answering, it closes the port and retries open with backoff until the modem
// comes back. Calls made while disconnected fail with ErrNotConnected.
type ReconnectingModem struct {
	open   func() (Modem, error)
	timing retryTiming
	done   chan struct{}

	mu       sync.Mutex
	cur      Modem // nil while disconnected
	closed   bool
	recvCtx  context.Context
	receive  func(from, body string) error
	stopRecv context.CancelFunc // stops the receiver of cur
}

// NewReconnectingSerialModem returns a modem that opens the serial device at
// devicePath and reconnects whenever it is unplugged. It does not fail when the
// device is missing: the first attempt is logged and retried in the background.
func NewReconnectingSerialModem(devicePath string, baudRate int) *ReconnectingModem {
	return newReconnectingModem(func() (Modem, error) {
		m, err := NewSerialModem(devicePath, baudRate)
		if err != nil {
			return nil, err
		}
		return m, nil
	}, defaultRetryTiming)
}

func newReconnectingModem(open func() (Modem, error), timing retryTiming) *ReconnectingModem {
	w := &ReconnectingModem{open: open, timing: timing, done: make(chan struct{})}
	w.tryOpen()
	go w.supervise()
	return w
}

// SendSMS sends an SMS through the connected modem.
func (w *ReconnectingModem) SendSMS(to, body string) error {
	m, err := w.current()
	if err != nil {
		return err
	}
	return m.SendSMS(to, body)
}

// CheckStatus reports whether a modem is connected and responding.
func (w *ReconnectingModem) CheckStatus() error {
	m, err := w.current()
	if err != nil {
		return err
	}
	return m.CheckStatus()
}

// GetSignal returns the signal strength of the connected modem.
func (w *ReconnectingModem) GetSignal() (int, error) {
	m, err := w.current()
	if err != nil {
		return 0, err
	}
	return m.GetSignal()
}

// SendAT sends a raw AT command to the connected modem.
func (w *ReconnectingModem) SendAT(cmd string) (string, error) {
	m, err := w.current()
	if err != nil {
		return "", err
	}
	return m.SendAT(cmd)
}

// StartReceiver polls for incoming SMS. The receiver is restarted on every new
// connection, so messages keep arriving after the modem is plugged back in.
func (w *ReconnectingModem) StartReceiver(ctx context.Context, callback func(from, body string) error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.recvCtx = ctx
	w.receive = callback
	w.startReceiverLocked()
}

// Close stops reconnecting and closes the modem if one is connected.
func (w *ReconnectingModem) Close() error {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return nil
	}
	w.closed = true
	close(w.done)
	old := w.detachLocked()
	w.mu.Unlock()

	if old == nil {
		return nil
	}
	return old.Close()
}

func (w *ReconnectingModem) current() (Modem, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.cur == nil {
		return nil, ErrNotConnected
	}
	return w.cur, nil
}

// supervise runs until Close. While connected it checks the modem; while
// disconnected it tries to open it again, waiting longer after each failure.
func (w *ReconnectingModem) supervise() {
	delay := w.timing.minDelay
	timer := time.NewTimer(w.timing.health)
	defer timer.Stop()

	for {
		select {
		case <-w.done:
			return
		case <-timer.C:
		}

		if m, err := w.current(); err == nil {
			statusErr := m.CheckStatus()
			if statusErr == nil {
				timer.Reset(w.timing.health)
				continue
			}
			log.Printf("Modem stopped responding, reconnecting: %v", statusErr)
			w.drop(m)
			delay = w.timing.minDelay
			timer.Reset(delay)
			continue
		}

		if w.tryOpen() {
			delay = w.timing.minDelay
			timer.Reset(w.timing.health)
			continue
		}

		timer.Reset(delay)
		delay = min(delay*2, w.timing.maxDelay)
	}
}

// tryOpen opens the modem and makes it the current connection. It reports
// whether the modem opened.
func (w *ReconnectingModem) tryOpen() bool {
	m, err := w.open()
	if err != nil {
		log.Printf("Modem not available, will retry: %v", err)
		return false
	}

	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		if err := m.Close(); err != nil {
			log.Printf("Warning: closing modem after shutdown: %v", err)
		}
		return false
	}
	w.cur = m
	w.startReceiverLocked()
	w.mu.Unlock()

	log.Println("Modem connected")
	return true
}

// drop disconnects m, which the health check found unresponsive.
func (w *ReconnectingModem) drop(m Modem) {
	w.mu.Lock()
	if w.cur != m {
		w.mu.Unlock()
		return
	}
	old := w.detachLocked()
	w.mu.Unlock()

	if err := old.Close(); err != nil {
		log.Printf("Warning: closing unresponsive modem: %v", err)
	}
}

// detachLocked clears the current connection and stops its receiver. It returns
// the old modem so the caller can close it without holding the lock, since
// closing waits for any command still running on the port.
func (w *ReconnectingModem) detachLocked() Modem {
	if w.stopRecv != nil {
		w.stopRecv()
		w.stopRecv = nil
	}
	old := w.cur
	w.cur = nil
	return old
}

// startReceiverLocked starts the receiver on the current connection, replacing
// any receiver that was running on a previous one.
func (w *ReconnectingModem) startReceiverLocked() {
	if w.receive == nil || w.cur == nil {
		return
	}
	if w.stopRecv != nil {
		w.stopRecv()
	}
	ctx, stop := context.WithCancel(w.recvCtx)
	w.stopRecv = stop
	w.cur.StartReceiver(ctx, w.receive)
}
