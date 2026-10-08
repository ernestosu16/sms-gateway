package modem

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/warthog618/sms"
	"go.bug.st/serial"
)

// Modem defines the interface for interacting with a GSM modem.
type Modem interface {
	SendSMS(to, body string) error
	CheckStatus() error
	GetSignal() (int, error)
	SendAT(cmd string) (string, error)
	StartReceiver(ctx context.Context, callback func(from, body string) error)
	Close() error
}

// SerialModem communicates with a GSM modem over a serial port.
type SerialModem struct {
	port serial.Port
	mu   sync.Mutex

	// encoder keeps its counters between messages so each long message gets its
	// own concatenation reference and the phone never mixes parts of two.
	encoder *sms.Encoder
}

// NewSerialModem opens a serial connection to the modem at the given device path and baud rate.
func NewSerialModem(devicePath string, baudRate int) (*SerialModem, error) {
	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(devicePath, mode)
	if err != nil {
		return nil, fmt.Errorf("opening serial port %s: %w", devicePath, err)
	}

	if err := port.SetReadTimeout(5 * time.Second); err != nil {
		port.Close()
		return nil, fmt.Errorf("setting read timeout: %w", err)
	}

	m := &SerialModem{port: port, encoder: sms.NewEncoder(sms.AsSubmit)}

	// Give the modem a moment to stabilize after port open.
	time.Sleep(500 * time.Millisecond)

	// Disable echo so responses don't include the command we sent.
	if _, err := m.SendAT("ATE0"); err != nil {
		port.Close()
		return nil, fmt.Errorf("disabling echo: %w", err)
	}

	// Text mode is the resting mode for raw AT commands; SendSMS and the
	// receiver switch to PDU mode and back.
	if _, err := m.SendAT(ATSetTextMode); err != nil {
		port.Close()
		return nil, fmt.Errorf("setting text mode: %w", err)
	}

	// Enable detailed error messages.
	if _, err := m.SendAT("AT+CMEE=1"); err != nil {
		// Not fatal — some modems don't support this.
		log.Printf("Warning: could not enable detailed errors: %v", err)
	}

	return m, nil
}

// SendSMS sends an SMS message to the given phone number.
//
// The message goes out in PDU mode: a body longer than one SMS is split into
// concatenated parts that the phone joins and shows as a single message, and
// text outside the GSM 7-bit alphabet is encoded as UCS-2. Every part is sent
// before returning; if one fails the error names it.
func (m *SerialModem) SendSMS(to, body string) error {
	if err := ValidateSMS(to, body); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	parts, err := encodeSubmitPDUs(m.encoder, to, body)
	if err != nil {
		return err
	}

	if _, err := sendCommand(m.port, ATSetPDUMode, 2*time.Second); err != nil {
		return fmt.Errorf("switching to PDU mode: %w", err)
	}
	defer func() {
		if _, err := sendCommand(m.port, ATSetTextMode, 2*time.Second); err != nil {
			log.Printf("Warning: failed to restore SMS text mode: %v", err)
		}
	}()

	for i, part := range parts {
		if err := sendPromptCommand(m.port, fmt.Sprintf("%s%d", ATSendSMS, part.length), 5*time.Second); err != nil {
			return fmt.Errorf("part %d/%d: waiting for SMS prompt: %w", i+1, len(parts), err)
		}

		resp, err := sendRawData(m.port, append([]byte(part.hex), 0x1A), 30*time.Second)
		if err != nil {
			return fmt.Errorf("part %d/%d: sending SMS: %w", i+1, len(parts), err)
		}
		if !containsCMGS(resp) {
			return fmt.Errorf("part %d/%d: unexpected send response: %s", i+1, len(parts), resp)
		}
	}

	return nil
}

// CheckStatus sends an AT command to check if the modem is responsive.
func (m *SerialModem) CheckStatus() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	_, err := sendCommand(m.port, ATCheck, 2*time.Second)
	if err != nil {
		return fmt.Errorf("modem not responding: %w", err)
	}
	return nil
}

// GetSignal queries the modem for signal strength and returns a value 0-31.
func (m *SerialModem) GetSignal() (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	resp, err := sendCommand(m.port, ATSignalQuality, 2*time.Second)
	if err != nil {
		return 0, fmt.Errorf("querying signal strength: %w", err)
	}

	return parseSignalStrength(resp)
}

// SendAT sends a raw AT command and returns the response.
func (m *SerialModem) SendAT(cmd string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	resp, err := sendCommand(m.port, cmd, 5*time.Second)
	if err != nil {
		return "", fmt.Errorf("sending AT command %q: %w", cmd, err)
	}
	return resp, nil
}

// StartReceiver polls for incoming SMS messages in a background goroutine.
// The callback should return nil if the message was successfully persisted.
// Only messages that are successfully processed are deleted from the SIM.
func (m *SerialModem) StartReceiver(ctx context.Context, callback func(from, body string) error) {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.mu.Lock()
				messages, err := m.listUnread()
				m.mu.Unlock()
				if err != nil {
					log.Printf("Failed to list unread SMS: %v", err)
					continue
				}

				for _, msg := range messages {
					if err := callback(msg.From, msg.Body); err != nil {
						log.Printf("Failed to process SMS from %s (SIM index %d): %v", msg.From, msg.Index, err)
						continue
					}
					// Only delete from SIM after successful DB insert.
					m.mu.Lock()
					deleteCmd := fmt.Sprintf("AT+CMGD=%d", msg.Index)
					_, delErr := sendCommand(m.port, deleteCmd, 2*time.Second)
					m.mu.Unlock()
					if delErr != nil {
						log.Printf("Failed to delete SMS at SIM index %d: %v", msg.Index, delErr)
					}
				}
			}
		}
	}()
}

// listUnread returns the unread SMS on the SIM. It reads them in PDU mode (see
// parsePDUList) and switches back to text mode before returning, because
// SendSMS relies on it. The caller must hold m.mu.
func (m *SerialModem) listUnread() ([]ParsedSMS, error) {
	if _, err := sendCommand(m.port, ATSetPDUMode, 2*time.Second); err != nil {
		return nil, fmt.Errorf("switching to PDU mode: %w", err)
	}

	resp, err := sendCommand(m.port, ATListUnreadPDU, 5*time.Second)

	if _, restoreErr := sendCommand(m.port, ATSetTextMode, 2*time.Second); restoreErr != nil {
		log.Printf("Warning: failed to restore SMS text mode: %v", restoreErr)
	}

	if err != nil {
		return nil, fmt.Errorf("listing unread SMS: %w", err)
	}
	return parsePDUList(resp), nil
}

// Close closes the serial port connection.
func (m *SerialModem) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err := m.port.Close(); err != nil {
		return fmt.Errorf("closing serial port: %w", err)
	}
	return nil
}

// containsCMGS checks for a +CMGS: response indicating the SMS was accepted.
func containsCMGS(resp string) bool {
	return strings.Contains(resp, "+CMGS:")
}
