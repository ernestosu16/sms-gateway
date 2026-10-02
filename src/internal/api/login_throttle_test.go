package api

import (
	"testing"
	"time"
)

func TestLoginThrottle(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	th := newLoginThrottle(func() time.Time { return now })

	for i := 0; i < maxFailedLogins; i++ {
		if wait := th.retryAfter("admin"); wait != 0 {
			t.Fatalf("blocked after %d failures, want %d allowed", i, maxFailedLogins)
		}
		th.fail("admin")
	}
	if wait := th.retryAfter("admin"); wait != failedLoginWindow {
		t.Fatalf("retryAfter = %v, want %v", wait, failedLoginWindow)
	}
	if wait := th.retryAfter("someone-else"); wait != 0 {
		t.Errorf("other usernames must not be blocked, got %v", wait)
	}

	now = now.Add(failedLoginWindow - time.Minute)
	if wait := th.retryAfter("admin"); wait != time.Minute {
		t.Errorf("retryAfter = %v, want %v", wait, time.Minute)
	}

	now = now.Add(time.Minute)
	if wait := th.retryAfter("admin"); wait != 0 {
		t.Errorf("still blocked after the window, retryAfter = %v", wait)
	}
	th.fail("admin")
	if wait := th.retryAfter("admin"); wait != 0 {
		t.Errorf("a failure after the window must start a new count, retryAfter = %v", wait)
	}

	th.reset("admin")
	if _, ok := th.failures["admin"]; ok {
		t.Error("reset must forget the username")
	}
}
