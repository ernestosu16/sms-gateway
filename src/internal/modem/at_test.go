package modem

import (
	"testing"
)

func TestParseSignalStrength(t *testing.T) {
	tests := []struct {
		name    string
		resp    string
		want    int
		wantErr bool
	}{
		{
			name: "normal response",
			resp: "+CSQ: 15,0\r\nOK",
			want: 15,
		},
		{
			name: "unknown signal",
			resp: "+CSQ: 99,99\r\nOK",
			want: 99,
		},
		{
			name: "zero signal",
			resp: "+CSQ: 0,0\r\nOK",
			want: 0,
		},
		{
			name:    "no CSQ prefix",
			resp:    "OK",
			wantErr: true,
		},
		{
			name:    "malformed value",
			resp:    "+CSQ: abc,0",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseSignalStrength(tt.resp)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseSignalStrength() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("parseSignalStrength() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestParseSMSList(t *testing.T) {
	tests := []struct {
		name     string
		resp     string
		wantLen  int
		wantFrom string
		wantBody string
	}{
		{
			name:     "single message",
			resp:     "+CMGL: 1,\"REC UNREAD\",\"+15551234567\",,\"2024/01/15 10:30:00+00\"\r\nHello world\r\nOK",
			wantLen:  1,
			wantFrom: "+15551234567",
			wantBody: "Hello world",
		},
		{
			name:    "multiple messages",
			resp:    "+CMGL: 1,\"REC UNREAD\",\"+15551111111\",,\"2024/01/15 10:30:00+00\"\r\nFirst message\r\n+CMGL: 2,\"REC UNREAD\",\"+15552222222\",,\"2024/01/15 11:00:00+00\"\r\nSecond message\r\nOK",
			wantLen: 2,
		},
		{
			name:    "empty response",
			resp:    "OK",
			wantLen: 0,
		},
		{
			name:    "no messages",
			resp:    "\r\nOK\r\n",
			wantLen: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			messages := parseSMSList(tt.resp)
			if len(messages) != tt.wantLen {
				t.Errorf("parseSMSList() returned %d messages, want %d", len(messages), tt.wantLen)
				return
			}
			if tt.wantLen > 0 && tt.wantFrom != "" {
				if messages[0].From != tt.wantFrom {
					t.Errorf("messages[0].From = %q, want %q", messages[0].From, tt.wantFrom)
				}
				if messages[0].Body != tt.wantBody {
					t.Errorf("messages[0].Body = %q, want %q", messages[0].Body, tt.wantBody)
				}
			}
		})
	}
}

func TestHasFinalResult(t *testing.T) {
	tests := []struct {
		name string
		resp string
		want bool
	}{
		{"OK on own line", "\r\nOK\r\n", true},
		{"ERROR on own line", "\r\nERROR\r\n", true},
		{"CME ERROR", "\r\n+CME ERROR: 10\r\n", true},
		{"CMS ERROR", "\r\n+CMS ERROR: 500\r\n", true},
		{"OK inside text", "The document is OK to send\r\n", false},
		{"partial response", "+CSQ: 15,0\r\n", false},
		{"empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := hasFinalResult(tt.resp)
			if got != tt.want {
				t.Errorf("hasFinalResult(%q) = %v, want %v", tt.resp, got, tt.want)
			}
		})
	}
}

func TestContainsFinalError(t *testing.T) {
	tests := []struct {
		name string
		resp string
		want bool
	}{
		{"OK is not error", "\r\nOK\r\n", false},
		{"ERROR", "\r\nERROR\r\n", true},
		{"CME ERROR", "\r\n+CME ERROR: 10\r\n", true},
		{"CMS ERROR", "\r\n+CMS ERROR: 302\r\n", true},
		{"no error", "+CSQ: 15,0\r\nOK\r\n", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := containsFinalError(tt.resp)
			if got != tt.want {
				t.Errorf("containsFinalError(%q) = %v, want %v", tt.resp, got, tt.want)
			}
		})
	}
}

func TestContainsCMGS(t *testing.T) {
	tests := []struct {
		name string
		resp string
		want bool
	}{
		{"success", "\r\n+CMGS: 42\r\n\r\nOK\r\n", true},
		{"no CMGS", "\r\nOK\r\n", false},
		{"error", "\r\n+CMS ERROR: 500\r\n", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := containsCMGS(tt.resp)
			if got != tt.want {
				t.Errorf("containsCMGS(%q) = %v, want %v", tt.resp, got, tt.want)
			}
		})
	}
}

func TestValidateSMS(t *testing.T) {
	tests := []struct {
		name    string
		to      string
		body    string
		wantErr bool
	}{
		{name: "international number", to: "+15551234567", body: "hello"},
		{name: "short code", to: "7726", body: "STOP"},
		{name: "multiline unicode body", to: "+15551234567", body: "línea 1\r\nline 2 🙂"},
		{name: "empty recipient", to: "", body: "hi", wantErr: true},
		{name: "plus only", to: "+", body: "hi", wantErr: true},
		{name: "too many digits", to: "+123456789012345678901", body: "hi", wantErr: true},
		{name: "formatted number", to: "+1 555-123-4567", body: "hi", wantErr: true},
		{name: "quote breaks out of AT+CMGS", to: `+1555";+CUSD=1,"*100#`, body: "hi", wantErr: true},
		{name: "CRLF injects a command", to: "+1555\r\nATD+19005550100;", body: "hi", wantErr: true},
		{name: "Ctrl+Z ends message early", to: "+15551234567", body: "hi\x1aATD+19005550100;\r", wantErr: true},
		{name: "ESC aborts message", to: "+15551234567", body: "hi\x1b", wantErr: true},
		{name: "NUL byte", to: "+15551234567", body: "hi\x00", wantErr: true},
		{name: "DEL", to: "+15551234567", body: "hi\x7f", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := ValidateSMS(tt.to, tt.body); (err != nil) != tt.wantErr {
				t.Fatalf("ValidateSMS(%q, %q) error = %v, wantErr %v", tt.to, tt.body, err, tt.wantErr)
			}
		})
	}
}
