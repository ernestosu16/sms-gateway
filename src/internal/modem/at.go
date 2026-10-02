package modem

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/warthog618/sms"
	"github.com/warthog618/sms/encoding/pdumode"
	"github.com/warthog618/sms/encoding/tpdu"
	"go.bug.st/serial"
)

// AT command constants.
const (
	ATCheck          = "AT"
	ATSetTextMode    = "AT+CMGF=1"
	ATSignalQuality  = "AT+CSQ"
	ATSendSMS        = "AT+CMGS="
	ATSetPDUMode     = "AT+CMGF=0"
	ATListUnreadPDU  = "AT+CMGL=0" // stat 0 = received unread, PDU mode
	ATListAllSMS     = "AT+CMGL=\"ALL\""
	ATDeleteReadSMS  = "AT+CMGD=1,1"
	ATSetCharsetGSM  = "AT+CSCS=\"GSM\""
	ATSetCharsetUCS2 = "AT+CSCS=\"UCS2\""
	ATSetDCSDefault  = "AT+CSMP=17,167,0,0" // GSM 7-bit encoding
	ATSetDCSUCS2     = "AT+CSMP=17,167,0,8" // UCS-2 encoding
)

// ParsedSMS holds a parsed incoming SMS from an AT+CMGL response.
type ParsedSMS struct {
	Index int
	From  string
	Body  string
}

// sendCommand writes an AT command to the serial port and reads until a final
// response line (OK, ERROR, +CME ERROR, +CMS ERROR) is received.
func sendCommand(port serial.Port, cmd string, timeout time.Duration) (string, error) {
	// Drain any stale data in the read buffer before sending.
	drainPort(port)

	if err := port.SetReadTimeout(timeout); err != nil {
		return "", fmt.Errorf("setting timeout: %w", err)
	}

	_, err := port.Write([]byte(cmd + "\r\n"))
	if err != nil {
		return "", fmt.Errorf("writing command: %w", err)
	}

	resp, err := readUntilFinal(port, timeout)
	if err != nil {
		return resp, err
	}

	if containsFinalError(resp) {
		return resp, fmt.Errorf("AT command error: %s", strings.TrimSpace(resp))
	}

	return resp, nil
}

// sendPromptCommand sends an AT command that expects a ">" prompt (e.g., AT+CMGS).
// It waits for the prompt before returning.
func sendPromptCommand(port serial.Port, cmd string, timeout time.Duration) error {
	drainPort(port)

	if err := port.SetReadTimeout(timeout); err != nil {
		return fmt.Errorf("setting timeout: %w", err)
	}

	_, err := port.Write([]byte(cmd + "\r\n"))
	if err != nil {
		return fmt.Errorf("writing command: %w", err)
	}

	// Read until we see the ">" prompt or a final error.
	buf := make([]byte, 256)
	var response strings.Builder
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		n, err := port.Read(buf)
		if err != nil {
			break
		}
		if n > 0 {
			response.Write(buf[:n])
			resp := response.String()
			if strings.Contains(resp, ">") {
				return nil
			}
			if containsFinalError(resp) {
				return fmt.Errorf("AT command error (expected prompt): %s", strings.TrimSpace(resp))
			}
		}
	}

	return fmt.Errorf("timed out waiting for prompt, got: %s", strings.TrimSpace(response.String()))
}

// sendRawData writes raw bytes to the port without appending \r\n,
// then reads until a final response.
func sendRawData(port serial.Port, data []byte, timeout time.Duration) (string, error) {
	if err := port.SetReadTimeout(timeout); err != nil {
		return "", fmt.Errorf("setting timeout: %w", err)
	}

	_, err := port.Write(data)
	if err != nil {
		return "", fmt.Errorf("writing data: %w", err)
	}

	resp, err := readUntilFinal(port, timeout)
	if err != nil {
		return resp, err
	}

	if containsFinalError(resp) {
		return resp, fmt.Errorf("AT command error: %s", strings.TrimSpace(resp))
	}

	return resp, nil
}

// readUntilFinal reads from the port until a final result code is found or timeout.
// Final result codes per 3GPP TS 27.007: OK, ERROR, +CME ERROR, +CMS ERROR.
func readUntilFinal(port serial.Port, timeout time.Duration) (string, error) {
	buf := make([]byte, 4096)
	var response strings.Builder
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		n, err := port.Read(buf)
		if err != nil {
			break
		}
		if n > 0 {
			response.Write(buf[:n])
			if hasFinalResult(response.String()) {
				return response.String(), nil
			}
		}
	}

	resp := response.String()
	if resp == "" {
		return "", fmt.Errorf("timed out with no response")
	}
	return resp, fmt.Errorf("timed out waiting for final result, partial: %s", strings.TrimSpace(resp))
}

// hasFinalResult checks whether the response contains a final result code
// on its own line. This avoids false-matching "OK" inside message bodies.
func hasFinalResult(resp string) bool {
	lines := strings.Split(resp, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "OK":
			return true
		case trimmed == "ERROR":
			return true
		case strings.HasPrefix(trimmed, "+CME ERROR:"):
			return true
		case strings.HasPrefix(trimmed, "+CMS ERROR:"):
			return true
		}
	}
	return false
}

// containsFinalError checks if the response contains an error result code on its own line.
func containsFinalError(resp string) bool {
	lines := strings.Split(resp, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "ERROR":
			return true
		case strings.HasPrefix(trimmed, "+CME ERROR:"):
			return true
		case strings.HasPrefix(trimmed, "+CMS ERROR:"):
			return true
		}
	}
	return false
}

// drainPort reads and discards any pending data from the serial port.
func drainPort(port serial.Port) {
	_ = port.SetReadTimeout(50 * time.Millisecond)
	buf := make([]byte, 1024)
	for {
		n, _ := port.Read(buf)
		if n == 0 {
			break
		}
	}
}

// parseSignalStrength parses the AT+CSQ response and returns the signal value (0-31).
// Response format: +CSQ: <rssi>,<ber>
func parseSignalStrength(resp string) (int, error) {
	idx := strings.Index(resp, "+CSQ:")
	if idx < 0 {
		return 0, fmt.Errorf("unexpected CSQ response: %s", resp)
	}

	after := strings.TrimSpace(resp[idx+5:])
	parts := strings.SplitN(after, ",", 2)
	if len(parts) < 1 {
		return 0, fmt.Errorf("malformed CSQ response: %s", resp)
	}

	val, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil {
		return 0, fmt.Errorf("parsing signal value: %w", err)
	}

	return val, nil
}

// maxRecipientDigits bounds a recipient number. E.164 allows 15 digits; the
// slack covers national prefixes.
const maxRecipientDigits = 20

// ValidateSMS rejects input that would escape the AT+CMGS command.
//
// The recipient is written inside AT+CMGS="<to>" and, in GSM 7-bit mode, the
// body is written to the port verbatim. A quote or CR/LF in the recipient, or a
// Ctrl+Z (ends the message) or ESC (aborts it) in the body, would hand the rest
// of the input to the modem as AT commands, so every SMS is checked here before
// it reaches the port.
func ValidateSMS(to, body string) error {
	digits := strings.TrimPrefix(to, "+")
	if digits == "" || len(digits) > maxRecipientDigits || strings.IndexFunc(digits, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
		return fmt.Errorf("recipient must be a phone number of up to %d digits with an optional leading +", maxRecipientDigits)
	}
	for _, r := range body {
		if (r < 0x20 && r != '\n' && r != '\r') || r == 0x7F {
			return fmt.Errorf("body contains control character %U", r)
		}
	}
	return nil
}

// isGSM7 checks whether all characters in the string are within the GSM 7-bit default alphabet.
func isGSM7(s string) bool {
	for _, r := range s {
		if r > 127 {
			return false
		}
		// GSM 7-bit covers basic ASCII printable chars, CR, LF, and a few extras.
		// Characters outside this set (like emoji) need UCS-2.
	}
	return true
}

// encodeUCS2 encodes a string as a UCS-2 hex string for AT+CMGS in UCS-2 mode.
func encodeUCS2(s string) string {
	runes := []rune(s)
	u16 := utf16.Encode(runes)
	var b strings.Builder
	for _, cp := range u16 {
		fmt.Fprintf(&b, "%04X", cp)
	}
	return b.String()
}

// parsePDUList parses an AT+CMGL response given in PDU mode into messages.
// Response format:
// +CMGL: <index>,<stat>,[<alpha>],<length>
// <hex PDU>
//
// PDU mode is used for reading because in text mode the body is printed raw
// between headers: an SMS containing a line that starts with "+CMGL:" would be
// parsed as a second message with a forged sender and SIM index. Here the body
// travels hex-encoded inside the PDU, so headers can only come from the modem.
// Entries that are not a decodable SMS-DELIVER are logged and skipped, which
// leaves them on the SIM.
func parsePDUList(resp string) []ParsedSMS {
	var messages []ParsedSMS
	lines := strings.Split(resp, "\n")

	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(line, "+CMGL:") {
			continue
		}

		fields := strings.SplitN(strings.TrimPrefix(line, "+CMGL:"), ",", 2)
		index, err := strconv.Atoi(strings.TrimSpace(fields[0]))
		if err != nil || i+1 >= len(lines) {
			continue
		}
		i++

		from, body, err := decodeDeliverPDU(strings.TrimSpace(lines[i]))
		if err != nil {
			log.Printf("Skipping SMS at SIM index %d: %v", index, err)
			continue
		}
		messages = append(messages, ParsedSMS{Index: index, From: from, Body: body})
	}

	return messages
}

// decodeDeliverPDU decodes a hex PDU (SMSC address followed by the TPDU) and
// returns the sender and text of an SMS-DELIVER. Each part of a concatenated
// message is decoded on its own, as text mode did.
func decodeDeliverPDU(hexPDU string) (from, body string, err error) {
	p, err := pdumode.UnmarshalHexString(hexPDU)
	if err != nil {
		return "", "", fmt.Errorf("decoding PDU: %w", err)
	}
	t, err := sms.Unmarshal(p.TPDU, sms.AsMT)
	if err != nil {
		return "", "", fmt.Errorf("decoding TPDU: %w", err)
	}
	if t.SmsType() != tpdu.SmsDeliver {
		return "", "", fmt.Errorf("unexpected TPDU type %v", t.SmsType())
	}
	text, err := sms.Decode([]*tpdu.TPDU{t})
	if err != nil {
		return "", "", fmt.Errorf("decoding user data: %w", err)
	}
	return t.OA.Number(), string(text), nil
}
