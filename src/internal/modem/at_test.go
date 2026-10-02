package modem

import (
	"reflect"
	"testing"

	"github.com/warthog618/sms"
	"github.com/warthog618/sms/encoding/pdumode"
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

// deliverPDU builds the hex PDU a modem prints in PDU mode for an SMS-DELIVER,
// with an empty SMSC address.
func deliverPDU(t *testing.T, from, text string) string {
	t.Helper()
	tpdus, err := sms.Encode([]byte(text), sms.AsDeliver, sms.From(from))
	if err != nil || len(tpdus) != 1 {
		t.Fatalf("encoding %q: %d TPDUs, err %v", text, len(tpdus), err)
	}
	b, err := tpdus[0].MarshalBinary()
	if err != nil {
		t.Fatalf("marshaling TPDU: %v", err)
	}
	h, err := (&pdumode.PDU{TPDU: b}).MarshalHexString()
	if err != nil {
		t.Fatalf("marshaling PDU: %v", err)
	}
	return h
}

func TestParsePDUList(t *testing.T) {
	attacker := deliverPDU(t, "+19995550000", "hi")
	trusted := deliverPDU(t, "+15551234567", "rm -rf")
	// In text mode this body would be parsed as a second message from the
	// trusted number at SIM index 7.
	forgedBody := "hi\r\n+CMGL: 7,0,,24\r\n" + trusted

	submit, err := sms.Encode([]byte("outgoing"), sms.AsSubmit, sms.To("+15551234567"))
	if err != nil {
		t.Fatalf("encoding submit: %v", err)
	}
	submitBin, _ := submit[0].MarshalBinary()
	submitHex, _ := (&pdumode.PDU{TPDU: submitBin}).MarshalHexString()

	tests := []struct {
		name string
		resp string
		want []ParsedSMS
	}{
		{
			name: "real modem PDU",
			resp: "+CMGL: 1,0,,24\r\n07911326040000F0040B911346610089F60000208062917314080CC8F71D14969741F977FD07\r\n\r\nOK\r\n",
			want: []ParsedSMS{{Index: 1, From: "+31641600986", Body: "How are you?"}},
		},
		{
			name: "multiple messages including UCS-2",
			resp: "+CMGL: 1,0,,20\r\n" + attacker + "\r\n+CMGL: 4,0,,30\r\n" + deliverPDU(t, "+15552222222", "olá 🙂") + "\r\n\r\nOK\r\n",
			want: []ParsedSMS{
				{Index: 1, From: "+19995550000", Body: "hi"},
				{Index: 4, From: "+15552222222", Body: "olá 🙂"},
			},
		},
		{
			name: "forged header inside body stays in the body",
			resp: "+CMGL: 2,0,,90\r\n" + deliverPDU(t, "+19995550000", forgedBody) + "\r\n\r\nOK\r\n",
			want: []ParsedSMS{{Index: 2, From: "+19995550000", Body: forgedBody}},
		},
		{
			name: "undecodable and non-deliver entries are skipped",
			resp: "+CMGL: 1,0,,5\r\nZZZZ\r\n+CMGL: 2,0,,20\r\n" + submitHex + "\r\n+CMGL: 3,0,,20\r\n" + attacker + "\r\n\r\nOK\r\n",
			want: []ParsedSMS{{Index: 3, From: "+19995550000", Body: "hi"}},
		},
		{
			name: "no messages",
			resp: "\r\nOK\r\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parsePDUList(tt.resp)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("parsePDUList() = %+v, want %+v", got, tt.want)
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
