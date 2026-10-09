package modem

import (
	"testing"
)

func TestMockModem_SendSMS(t *testing.T) {
	m := NewMockModem()

	if err := m.SendSMS("+15551234567", "test message"); err != nil {
		t.Fatalf("SendSMS() error = %v", err)
	}

	sent := m.SentMessages()
	if len(sent) != 1 {
		t.Fatalf("SentMessages() len = %d, want 1", len(sent))
	}
	if sent[0].To != "+15551234567" {
		t.Errorf("sent[0].To = %q, want %q", sent[0].To, "+15551234567")
	}
	if sent[0].Body != "test message" {
		t.Errorf("sent[0].Body = %q, want %q", sent[0].Body, "test message")
	}
}

func TestMockModem_CheckStatus(t *testing.T) {
	m := NewMockModem()
	if err := m.CheckStatus(); err != nil {
		t.Fatalf("CheckStatus() error = %v", err)
	}
}

func TestMockModem_GetSignal(t *testing.T) {
	m := NewMockModem()
	signal, err := m.GetSignal()
	if err != nil {
		t.Fatalf("GetSignal() error = %v", err)
	}
	if signal != 20 {
		t.Errorf("GetSignal() = %d, want 20", signal)
	}
}

func TestMockModem_SendAT(t *testing.T) {
	m := NewMockModem()

	tests := []struct {
		cmd  string
		want string
	}{
		{"AT+CSQ", "\r\n+CSQ: 20,99\r\n\r\nOK\r\n"},
		{" at+cpin? ", "\r\n+CPIN: READY\r\n\r\nOK\r\n"},
		{"AT+CMNB=1", "\r\nOK\r\n"},
	}
	for _, tt := range tests {
		resp, err := m.SendAT(tt.cmd)
		if err != nil {
			t.Fatalf("SendAT(%q) error = %v", tt.cmd, err)
		}
		if resp != tt.want {
			t.Errorf("SendAT(%q) = %q, want %q", tt.cmd, resp, tt.want)
		}
	}
}

func TestMockModem_ImplementsInterface(t *testing.T) {
	var _ Modem = (*MockModem)(nil)
}
