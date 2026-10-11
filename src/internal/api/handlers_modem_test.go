package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
)

func TestHandleModemStatus(t *testing.T) {
	mock := modem.NewMockModem()
	handler := NewModemHandler(mock)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/modem/status", nil)
	w := httptest.NewRecorder()

	handler.HandleModemStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp models.ModemStatusResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Status != "ok" {
		t.Errorf("resp.Status = %q, want %q", resp.Status, "ok")
	}
}

func TestHandleModemSignal(t *testing.T) {
	mock := modem.NewMockModem()
	handler := NewModemHandler(mock)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/modem/signal", nil)
	w := httptest.NewRecorder()

	handler.HandleModemSignal(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp models.ModemSignalResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Signal != 20 {
		t.Errorf("resp.Signal = %d, want 20", resp.Signal)
	}
	if resp.Quality != "excellent" {
		t.Errorf("resp.Quality = %q, want %q", resp.Quality, "excellent")
	}
}

func TestHandleModemInfo(t *testing.T) {
	handler := NewModemHandler(modem.NewMockModem())

	w := httptest.NewRecorder()
	handler.HandleModemInfo(w, httptest.NewRequest(http.MethodGet, "/api/v1/modem/info", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	var resp models.ModemInfoResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if resp.Provider != "Tello" || resp.Network != "T-Mobile" || resp.PhoneNumber != "+13055550123" || resp.IMEI == "" {
		t.Errorf("resp = %+v", resp)
	}
}

// countingModem counts the AT commands sent to the mock modem.
type countingModem struct {
	*modem.MockModem
	sent int
}

func (m *countingModem) SendAT(cmd string) (string, error) {
	m.sent++
	return m.MockModem.SendAT(cmd)
}

func TestHandleModemInfoCached(t *testing.T) {
	m := &countingModem{MockModem: modem.NewMockModem()}
	handler := NewModemHandler(m)

	get := func(url string) {
		t.Helper()
		w := httptest.NewRecorder()
		handler.HandleModemInfo(w, httptest.NewRequest(http.MethodGet, url, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("GET %s: status = %d, want %d", url, w.Code, http.StatusOK)
		}
	}

	get("/api/v1/modem/info")
	first := m.sent
	if first == 0 {
		t.Fatal("first request sent no AT commands")
	}
	get("/api/v1/modem/info")
	if m.sent != first {
		t.Errorf("cached request sent %d AT commands, want 0", m.sent-first)
	}
	get("/api/v1/modem/info?refresh=true")
	if m.sent != 2*first {
		t.Errorf("refresh sent %d AT commands, want %d", m.sent-first, first)
	}
}

func TestHandleSendATCommand(t *testing.T) {
	mock := modem.NewMockModem()
	handler := NewModemHandler(mock)

	body := `{"command":"AT+CSQ"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/modem/at", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleSendATCommand(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp models.ATCommandResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Response == "" {
		t.Error("resp.Response should not be empty")
	}
}

func TestHandleSendATCommand_EmptyCommand(t *testing.T) {
	mock := modem.NewMockModem()
	handler := NewModemHandler(mock)

	body := `{"command":""}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/modem/at", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleSendATCommand(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestHandleSendATCommandConfirmation(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		wantCode int
		wantRisk string
	}{
		{name: "safe runs directly", body: `{"command":"AT+CSQ"}`, wantCode: http.StatusOK},
		{name: "reading a dangerous command is safe", body: `{"command":"AT+CFUN?"}`, wantCode: http.StatusOK},
		{name: "dangerous needs confirm", body: `{"command":"AT+CFUN=0"}`, wantCode: http.StatusConflict, wantRisk: "dangerous"},
		{name: "dangerous with confirm runs", body: `{"command":"AT+CFUN=0","confirm":true}`, wantCode: http.StatusOK},
		{name: "unknown needs confirm", body: `{"command":"AT^SYSINFO"}`, wantCode: http.StatusConflict, wantRisk: "unknown"},
		{name: "chained command needs confirm", body: `{"command":"AT+CSQ;+CFUN=0"}`, wantCode: http.StatusConflict, wantRisk: "unknown"},
		{name: "unknown with confirm runs", body: `{"command":"AT^SYSINFO","confirm":true}`, wantCode: http.StatusOK},
		{name: "control characters are rejected", body: `{"command":"AT+CSQ\rAT+CFUN=0","confirm":true}`, wantCode: http.StatusBadRequest},
		{name: "missing AT prefix is rejected", body: `{"command":"CSQ"}`, wantCode: http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := NewModemHandler(modem.NewMockModem())
			req := httptest.NewRequest(http.MethodPost, "/api/v1/modem/at", strings.NewReader(tt.body))
			w := httptest.NewRecorder()
			handler.HandleSendATCommand(w, req)

			if w.Code != tt.wantCode {
				t.Fatalf("status = %d, want %d (body %s)", w.Code, tt.wantCode, w.Body.String())
			}
			if tt.wantCode == http.StatusConflict {
				var resp models.ATConfirmationRequired
				if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
					t.Fatalf("decoding: %v", err)
				}
				if !resp.RequiresConfirmation || resp.Risk != tt.wantRisk {
					t.Errorf("response = %+v, want requires_confirmation with risk %q", resp, tt.wantRisk)
				}
			}
		})
	}
}

func TestHandleATCatalog(t *testing.T) {
	handler := NewModemHandler(modem.NewMockModem())
	w := httptest.NewRecorder()
	handler.HandleATCatalog(w, httptest.NewRequest(http.MethodGet, "/api/v1/modem/at/commands", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var resp ATCatalogResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if len(resp.Commands) != len(modem.ATCatalog) {
		t.Errorf("got %d commands, want %d", len(resp.Commands), len(modem.ATCatalog))
	}
	// The mock modem does not answer AT+CLAC with a command list.
	if resp.Supported != nil {
		t.Errorf("supported = %v, want null", resp.Supported)
	}
}

func TestSignalQuality(t *testing.T) {
	tests := []struct {
		signal int
		want   string
	}{
		{99, "unknown"},
		{25, "excellent"},
		{20, "excellent"},
		{17, "good"},
		{15, "good"},
		{12, "fair"},
		{10, "fair"},
		{5, "poor"},
		{2, "poor"},
		{1, "none"},
		{0, "none"},
	}

	for _, tt := range tests {
		got := signalQuality(tt.signal)
		if got != tt.want {
			t.Errorf("signalQuality(%d) = %q, want %q", tt.signal, got, tt.want)
		}
	}
}
