package modem

import (
	"context"
	"log"
	"strings"
	"sync"
)

// MockModem simulates a GSM modem for development and testing.
type MockModem struct {
	mu       sync.Mutex
	messages []MockMessage
}

// MockMessage holds a message sent through the mock modem.
type MockMessage struct {
	To   string
	Body string
}

// NewMockModem creates a new mock modem.
func NewMockModem() *MockModem {
	log.Println("[mock modem] initialized")
	return &MockModem{}
}

// SendSMS simulates sending an SMS message.
func (m *MockModem) SendSMS(to, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	log.Printf("[mock modem] SendSMS to=%s body=%q", to, body)
	m.messages = append(m.messages, MockMessage{To: to, Body: body})
	return nil
}

// CheckStatus simulates a modem status check.
func (m *MockModem) CheckStatus() error {
	log.Println("[mock modem] CheckStatus: OK")
	return nil
}

// GetSignal returns a fake signal strength.
func (m *MockModem) GetSignal() (int, error) {
	log.Println("[mock modem] GetSignal: 20")
	return 20, nil
}

// mockATReplies holds the information lines a registered LTE-M modem with a
// Tello SIM (an MVNO on T-Mobile) returns for common queries, keyed by the
// upper-cased command. They are consistent with GetSignal and with a SIM that
// is ready and registered, so carrier setup checks pass in dev mode.
var mockATReplies = map[string]string{
	"ATI":       "SIMCOM_SIM7080G\r\nRevision:mock",
	"AT+CPIN?":  "+CPIN: READY",
	"AT+CFUN?":  "+CFUN: 1",
	"AT+CMNB?":  "+CMNB: 1",
	"AT+CNMP?":  "+CNMP: 38",
	"AT+CREG?":  "+CREG: 0,1",
	"AT+CEREG?": "+CEREG: 2,1",
	"AT+COPS?":  `+COPS: 0,0,"T-Mobile",9`,
	"AT+CSPN?":  `+CSPN: "Tello",0`,
	"AT+CNUM":   `+CNUM: "","+13055550123",145`,
	"AT+CGMR":   "Revision:1951B17SIM7080",
	"AT+CSQ":    "+CSQ: 20,99",
	"AT+CMGF?":  "+CMGF: 1",
	"AT+CSCA?":  `+CSCA: "+12063130004",145`,
	"AT+CPSI?":  "+CPSI: LTE CAT-M1,Online,310-260,0x1A2B,12345678,100,EUTRAN-BAND12,5110,3,3,-10,-90,-60,15",
	"AT+CPMS?":  `+CPMS: "SM",0,50,"SM",0,50,"SM",0,50`,
	"AT+CNMI?":  "+CNMI: 2,1,0,0,0",
	"AT+CMEE?":  "+CMEE: 1",
	"AT+CGMI":   "SIMCOM INCORPORATED",
	"AT+CGMM":   "SIMCOM_SIM7080G",
	"AT+CIMI":   "310260000000000",
	"AT+CCID":   "8901260000000000000",
	"AT+CGSN":   "860000000000000",
}

// SendAT simulates sending a raw AT command. Known queries get a realistic
// reply framed the way the serial modem returns it (echo off); anything else,
// including set commands, just succeeds.
func (m *MockModem) SendAT(cmd string) (string, error) {
	log.Printf("[mock modem] SendAT: %s", cmd)
	if info, ok := mockATReplies[strings.ToUpper(strings.TrimSpace(cmd))]; ok {
		return "\r\n" + info + "\r\n\r\nOK\r\n", nil
	}
	return "\r\nOK\r\n", nil
}

// StartReceiver does nothing in mock mode.
func (m *MockModem) StartReceiver(_ context.Context, _ func(from, body string) error) {
	log.Println("[mock modem] StartReceiver: no-op in mock mode")
}

// Close does nothing in mock mode.
func (m *MockModem) Close() error {
	log.Println("[mock modem] Close")
	return nil
}

// SentMessages returns all messages sent through the mock modem.
func (m *MockModem) SentMessages() []MockMessage {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make([]MockMessage, len(m.messages))
	copy(out, m.messages)
	return out
}
