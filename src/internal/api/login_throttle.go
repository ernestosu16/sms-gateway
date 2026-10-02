package api

import (
	"sync"
	"time"
)

const (
	// maxFailedLogins failures within failedLoginWindow block further logins
	// for that username until the window ends.
	maxFailedLogins   = 5
	failedLoginWindow = 15 * time.Minute

	// throttleSweepSize is the tracked-username count above which expired
	// entries are swept, at most once per minute.
	throttleSweepSize = 1024
)

// loginThrottle limits failed logins per username.
//
// It is keyed on the username, not the client IP: the RealIP middleware takes
// the IP from client-supplied headers, so a per-IP limit could be dodged by
// rotating X-Forwarded-For, and behind a proxy every client would share one
// bucket. The trade-off is that someone hammering a username also blocks its
// owner until the window ends. Unknown usernames are tracked the same way so
// the response does not reveal which ones exist.
type loginThrottle struct {
	mu        sync.Mutex
	now       func() time.Time
	failures  map[string]failedLogins
	lastSweep time.Time
}

type failedLogins struct {
	count int
	since time.Time
}

func newLoginThrottle(now func() time.Time) *loginThrottle {
	return &loginThrottle{now: now, failures: map[string]failedLogins{}}
}

// retryAfter returns how long username must wait before trying again, or zero
// when a login may be attempted.
func (t *loginThrottle) retryAfter(username string) time.Duration {
	t.mu.Lock()
	defer t.mu.Unlock()

	f, ok := t.failures[username]
	if !ok || f.count < maxFailedLogins {
		return 0
	}
	return max(f.since.Add(failedLoginWindow).Sub(t.now()), 0)
}

// fail records a failed login for username.
func (t *loginThrottle) fail(username string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := t.now()
	f, ok := t.failures[username]
	if !ok || now.Sub(f.since) >= failedLoginWindow {
		f = failedLogins{since: now}
	}
	f.count++
	t.failures[username] = f

	if len(t.failures) > throttleSweepSize && now.Sub(t.lastSweep) >= time.Minute {
		t.lastSweep = now
		for name, f := range t.failures {
			if now.Sub(f.since) >= failedLoginWindow {
				delete(t.failures, name)
			}
		}
	}
}

// reset forgets the failures of username after a successful login.
func (t *loginThrottle) reset(username string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.failures, username)
}
