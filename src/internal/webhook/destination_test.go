package webhook

import (
	"net/netip"
	"strings"
	"testing"

	"github.com/mattboston/sms-gateway/internal/models"
)

func TestCheckDestination(t *testing.T) {
	tests := []struct {
		addr    string
		allowed bool
	}{
		{"203.0.113.10", true},
		{"192.168.1.20", true},
		{"10.0.0.5", true},
		{"127.0.0.1", true},
		{"::1", true},
		{"2001:db8::1", true},
		{"169.254.169.254", false},
		{"::ffff:169.254.169.254", false},
		{"fe80::1", false},
		{"100.100.100.200", false},
		{"fd00:ec2::254", false},
		{"224.0.0.1", false},
		{"0.0.0.0", false},
		{"::", false},
	}

	for _, tt := range tests {
		t.Run(tt.addr, func(t *testing.T) {
			err := CheckDestination(netip.MustParseAddr(tt.addr))
			if (err == nil) != tt.allowed {
				t.Errorf("CheckDestination(%s) error = %v, allowed want %v", tt.addr, err, tt.allowed)
			}
		})
	}
}

// TestSend_RefusesBlockedAddressAtDial checks the dial-time guard. It runs on
// the resolved IP, so hostnames pointing at a refused address, including via
// DNS rebinding after the webhook was saved, are caught the same way.
func TestSend_RefusesBlockedAddressAtDial(t *testing.T) {
	d, _ := newTestDispatcher(t)
	hook := models.Webhook{ID: "h", Name: "metadata", URL: "http://169.254.169.254/latest/meta-data/", Secret: "s"}

	err := d.send(hook, models.WebhookPayload{ID: "e", Event: models.EventMessageSent}, []byte(`{}`))
	if err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Fatalf("send() error = %v, want a refused destination", err)
	}
}
