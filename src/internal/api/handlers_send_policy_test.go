package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
	"github.com/mattboston/sms-gateway/internal/webhook/webhooktest"
)

func putSendPolicy(t *testing.T, h *SendPolicyHandler, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/v1/sms/send-policy", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.HandleUpdateSendPolicy(rec, req)
	return rec
}

func TestHandleGetSendPolicy_DefaultsToAll(t *testing.T) {
	h := NewSendPolicyHandler(webhooktest.NewRepository(t))
	rec := httptest.NewRecorder()
	h.HandleGetSendPolicy(rec, httptest.NewRequest(http.MethodGet, "/api/v1/sms/send-policy", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var got models.SendCountryPolicy
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if got.Mode != models.SendCountriesAll || len(got.Countries) != 0 {
		t.Errorf("policy = %+v, want mode all with no countries", got)
	}
}

func TestHandleUpdateSendPolicy(t *testing.T) {
	tests := []struct {
		name          string
		body          string
		wantStatus    int
		wantCountries []string
	}{
		{"normalizes and dedupes countries", `{"mode":"selected","countries":["us"," CA ","US"]}`, http.StatusOK, []string{"CA", "US"}},
		{"drops countries outside selected mode", `{"mode":"none","countries":["US"]}`, http.StatusOK, []string{}},
		{"rejects unknown country", `{"mode":"selected","countries":["XX"]}`, http.StatusBadRequest, nil},
		{"rejects empty selection", `{"mode":"selected","countries":[]}`, http.StatusBadRequest, nil},
		{"rejects unknown mode", `{"mode":"some"}`, http.StatusBadRequest, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := NewSendPolicyHandler(webhooktest.NewRepository(t))
			rec := putSendPolicy(t, h, tt.body)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body.String())
			}
			if tt.wantCountries == nil {
				return
			}
			var got models.SendCountryPolicy
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatalf("decoding response: %v", err)
			}
			if !slices.Equal(got.Countries, tt.wantCountries) {
				t.Errorf("countries = %v, want %v", got.Countries, tt.wantCountries)
			}
		})
	}
}

// TestHandleSendSMS_EnforcesSendPolicy checks a blocked destination is refused
// before anything is stored or handed to the modem.
func TestHandleSendSMS_EnforcesSendPolicy(t *testing.T) {
	h, repo := newSMSTestHandler(t)
	mock := h.modem.(*modem.MockModem)
	if _, err := repo.SaveSendCountryPolicy(models.SendCountriesSelected, []string{"US"}); err != nil {
		t.Fatalf("SaveSendCountryPolicy() error = %v", err)
	}

	send := func(to string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/sms/send", strings.NewReader(`{"to":"`+to+`","body":"hi"}`))
		rec := httptest.NewRecorder()
		h.HandleSendSMS(rec, req)
		return rec.Code
	}

	if code := send("+34612345678"); code != http.StatusForbidden {
		t.Fatalf("send to ES status = %d, want 403", code)
	}
	if sent := mock.SentMessages(); len(sent) != 0 {
		t.Errorf("modem received %d messages, want none", len(sent))
	}
	if total, err := repo.CountMessages(models.DirectionOutbound, nil); err != nil || total != 0 {
		t.Errorf("stored outbound messages = %d (err %v), want 0", total, err)
	}

	if code := send("+14155552671"); code != http.StatusOK {
		t.Fatalf("send to US status = %d, want 200", code)
	}
}
