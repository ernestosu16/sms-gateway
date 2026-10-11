package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mattboston/sms-gateway/internal/models"
)

const validProfileBody = `{"name":" Test carrier ","description":"d","notes":"n","steps":[
	{"title":" Check ","commands":[{"command":" AT ","expect":"OK"},{"command":"AT+CPIN?"}]}
]}`

func decodeModemProfile(t *testing.T, w *httptest.ResponseRecorder) models.ModemProfile {
	t.Helper()
	var p models.ModemProfile
	if err := json.NewDecoder(w.Body).Decode(&p); err != nil {
		t.Fatalf("decoding modem profile: %v", err)
	}
	return p
}

func TestHandleListModemProfiles_SeedsTello(t *testing.T) {
	handler := NewModemProfileHandler(newListTestRepo(t))

	w := httptest.NewRecorder()
	handler.HandleListModemProfiles(w, httptest.NewRequest(http.MethodGet, "/api/v1/modem/profiles", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	var profiles []models.ModemProfile
	if err := json.NewDecoder(w.Body).Decode(&profiles); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if len(profiles) != 1 || profiles[0].Name != "Tello USA" {
		t.Fatalf("profiles = %+v, want only the Tello USA seed", profiles)
	}
	tello := profiles[0]
	if len(tello.Steps) != 5 {
		t.Fatalf("Tello steps = %d, want 5", len(tello.Steps))
	}
	// The seed must itself pass the validation applied to edits, or saving it
	// unchanged from the WebUI would fail.
	req := models.ModemProfileRequest{Name: tello.Name, Description: tello.Description, Notes: tello.Notes, Steps: tello.Steps}
	if err := normalizeModemProfileRequest(&req); err != nil {
		t.Fatalf("seed does not validate: %v", err)
	}
	if got := tello.Steps[2].Commands[1]; got.Command != "AT+CEREG?" || got.Expect != `\+CEREG:\s*\d,[15]` {
		t.Errorf("CEREG command = %+v", got)
	}
}

func TestModemProfileCRUD(t *testing.T) {
	handler := NewModemProfileHandler(newListTestRepo(t))

	w := httptest.NewRecorder()
	handler.HandleCreateModemProfile(w, httptest.NewRequest(http.MethodPost, "/api/v1/modem/profiles", strings.NewReader(validProfileBody)))
	if w.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", w.Code, w.Body.String())
	}
	created := decodeModemProfile(t, w)
	if created.ID == "" || created.Name != "Test carrier" || created.Steps[0].Title != "Check" || created.Steps[0].Commands[0].Command != "AT" {
		t.Fatalf("created = %+v, want trimmed fields and an ID", created)
	}

	w = httptest.NewRecorder()
	handler.HandleGetModemProfile(w, withURLParam(httptest.NewRequest(http.MethodGet, "/", nil), "id", created.ID))
	if w.Code != http.StatusOK || decodeModemProfile(t, w).Name != "Test carrier" {
		t.Fatalf("get status = %d", w.Code)
	}

	update := `{"name":"Renamed","steps":[{"title":"Only","commands":[{"command":"AT+CSQ"}]}]}`
	w = httptest.NewRecorder()
	handler.HandleUpdateModemProfile(w, withURLParam(httptest.NewRequest(http.MethodPut, "/", strings.NewReader(update)), "id", created.ID))
	if w.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", w.Code, w.Body.String())
	}
	if updated := decodeModemProfile(t, w); updated.Name != "Renamed" || updated.Notes != "" || len(updated.Steps) != 1 {
		t.Errorf("updated = %+v", updated)
	}

	w = httptest.NewRecorder()
	handler.HandleDeleteModemProfile(w, withURLParam(httptest.NewRequest(http.MethodDelete, "/", nil), "id", created.ID))
	if w.Code != http.StatusOK {
		t.Fatalf("delete status = %d", w.Code)
	}

	for name, call := range map[string]func(http.ResponseWriter, *http.Request){
		"get":    handler.HandleGetModemProfile,
		"delete": handler.HandleDeleteModemProfile,
	} {
		w = httptest.NewRecorder()
		call(w, withURLParam(httptest.NewRequest(http.MethodGet, "/", nil), "id", created.ID))
		if w.Code != http.StatusNotFound {
			t.Errorf("%s after delete status = %d, want 404", name, w.Code)
		}
	}
	w = httptest.NewRecorder()
	handler.HandleUpdateModemProfile(w, withURLParam(httptest.NewRequest(http.MethodPut, "/", strings.NewReader(update)), "id", created.ID))
	if w.Code != http.StatusNotFound {
		t.Errorf("update after delete status = %d, want 404", w.Code)
	}
}

func TestHandleCreateModemProfile_Validation(t *testing.T) {
	handler := NewModemProfileHandler(newListTestRepo(t))

	tests := []struct {
		name string
		body string
	}{
		{"invalid json", `{`},
		{"missing name", `{"name":" ","steps":[{"title":"a","commands":[{"command":"AT"}]}]}`},
		{"no steps", `{"name":"a","steps":[]}`},
		{"missing step title", `{"name":"a","steps":[{"title":"","commands":[{"command":"AT"}]}]}`},
		{"step without commands", `{"name":"a","steps":[{"title":"a","commands":[]}]}`},
		{"not an AT command", `{"name":"a","steps":[{"title":"a","commands":[{"command":"rm -rf"}]}]}`},
		{"control characters", `{"name":"a","steps":[{"title":"a","commands":[{"command":"AT\r\nATZ"}]}]}`},
		{"invalid expect", `{"name":"a","steps":[{"title":"a","commands":[{"command":"AT","expect":"(unclosed"}]}]}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			handler.HandleCreateModemProfile(w, httptest.NewRequest(http.MethodPost, "/api/v1/modem/profiles", strings.NewReader(tt.body)))
			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400 (body %s)", w.Code, w.Body.String())
			}
		})
	}
}

// TestHandleCreateModemProfile_ErrorCode checks that a refused command is
// reported with codes the WebUI can translate, including the nested reason.
func TestHandleCreateModemProfile_ErrorCode(t *testing.T) {
	handler := NewModemProfileHandler(newListTestRepo(t))

	body := `{"name":"a","steps":[{"title":"a","commands":[{"command":"AT"},{"command":"rm -rf"}]}]}`
	w := httptest.NewRecorder()
	handler.HandleCreateModemProfile(w, httptest.NewRequest(http.MethodPost, "/api/v1/modem/profiles", strings.NewReader(body)))

	var got struct {
		Error  string `json:"error"`
		Code   string `json:"code"`
		Params struct {
			Step    int `json:"step"`
			Command int `json:"command"`
			Reason  struct {
				Code string `json:"code"`
			} `json:"reason"`
		} `json:"params"`
	}
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decoding error response: %v", err)
	}
	if got.Code != "profile_command_invalid" || got.Params.Step != 1 || got.Params.Command != 2 {
		t.Errorf("response = %+v, want profile_command_invalid for step 1, command 2", got)
	}
	if got.Params.Reason.Code != "at_command_prefix" {
		t.Errorf("reason code = %q, want at_command_prefix", got.Params.Reason.Code)
	}
	if want := "step 1, command 2: invalid AT command: must start with AT"; got.Error != want {
		t.Errorf("error = %q, want %q", got.Error, want)
	}
}
