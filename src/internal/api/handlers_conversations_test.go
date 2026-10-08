package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/mattboston/sms-gateway/internal/models"
)

func TestHandleListConversations(t *testing.T) {
	handler, repo := newSMSTestHandler(t)
	seedMessages(t, repo, models.DirectionInbound, models.StatusReceived, 3)
	if _, err := repo.CreateMessage(models.DirectionOutbound, "+1555111", "hi", models.StatusSent, nil); err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	handler.HandleListConversations(w, httptest.NewRequest(http.MethodGet, "/api/v1/sms/conversations?limit=1", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if got := w.Header().Get("X-Total-Count"); got != "2" {
		t.Errorf("X-Total-Count = %q, want 2", got)
	}
	var got []models.Conversation
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if len(got) != 1 {
		t.Errorf("returned %d conversations, want 1", len(got))
	}
}

func TestHandleListConversations_EmptyIsArrayNotNull(t *testing.T) {
	handler, _ := newSMSTestHandler(t)

	w := httptest.NewRecorder()
	handler.HandleListConversations(w, httptest.NewRequest(http.MethodGet, "/api/v1/sms/conversations", nil))

	if body := w.Body.String(); body != "[]\n" {
		t.Errorf("body = %q, want %q", body, "[]\n")
	}
}

func TestHandleGetConversationMessages(t *testing.T) {
	handler, repo := newSMSTestHandler(t)
	seedMessages(t, repo, models.DirectionInbound, models.StatusReceived, 5)

	// A formatted number in the query resolves to the stored normalized one.
	q := url.Values{"phone": {"+1 555-000-000"}, "limit": {"2"}}
	w := httptest.NewRecorder()
	handler.HandleGetConversationMessages(w, httptest.NewRequest(http.MethodGet, "/api/v1/sms/conversations/messages?"+q.Encode(), nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", w.Code, w.Body)
	}
	if got := w.Header().Get("X-Total-Count"); got != "5" {
		t.Errorf("X-Total-Count = %q, want 5", got)
	}
	page := decodeMessages(t, w)
	if len(page) != 2 {
		t.Fatalf("returned %d messages, want 2", len(page))
	}

	q.Set("before_id", page[1].ID)
	w = httptest.NewRecorder()
	handler.HandleGetConversationMessages(w, httptest.NewRequest(http.MethodGet, "/api/v1/sms/conversations/messages?"+q.Encode(), nil))
	older := decodeMessages(t, w)
	for _, m := range older {
		if m.ID == page[0].ID || m.ID == page[1].ID {
			t.Errorf("older page repeated message %s", m.ID)
		}
	}
}

func TestHandleConversationEndpoints_RequirePhone(t *testing.T) {
	handler, _ := newSMSTestHandler(t)

	for name, h := range map[string]http.HandlerFunc{
		"messages": handler.HandleGetConversationMessages,
		"read":     handler.HandleMarkConversationRead,
		"delete":   handler.HandleDeleteConversation,
	} {
		w := httptest.NewRecorder()
		h(w, httptest.NewRequest(http.MethodGet, "/x", nil))
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s without phone: status = %d, want 400", name, w.Code)
		}
	}
}

func TestHandleGetConversationMessages_BeforeIDFromOtherThread(t *testing.T) {
	handler, repo := newSMSTestHandler(t)
	other, _ := repo.CreateMessage(models.DirectionInbound, "+1999", "x", models.StatusReceived, nil)

	q := url.Values{"phone": {"+1555"}, "before_id": {other.ID}}
	w := httptest.NewRecorder()
	handler.HandleGetConversationMessages(w, httptest.NewRequest(http.MethodGet, "/x?"+q.Encode(), nil))
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleMarkConversationReadAndDelete(t *testing.T) {
	handler, repo := newSMSTestHandler(t)
	seedMessages(t, repo, models.DirectionInbound, models.StatusReceived, 3)

	q := "?phone=" + url.QueryEscape("+1555000000")
	w := httptest.NewRecorder()
	handler.HandleMarkConversationRead(w, httptest.NewRequest(http.MethodPut, "/x"+q, nil))
	var resp models.ConversationUpdateResponse
	_ = json.NewDecoder(w.Body).Decode(&resp)
	if w.Code != http.StatusOK || resp.Affected != 3 {
		t.Errorf("read: status %d affected %d, want 200/3", w.Code, resp.Affected)
	}

	w = httptest.NewRecorder()
	handler.HandleDeleteConversation(w, httptest.NewRequest(http.MethodDelete, "/x"+q, nil))
	_ = json.NewDecoder(w.Body).Decode(&resp)
	if w.Code != http.StatusOK || resp.Affected != 3 {
		t.Errorf("delete: status %d affected %d, want 200/3", w.Code, resp.Affected)
	}
}
