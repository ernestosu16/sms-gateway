package database

import (
	"testing"

	"github.com/mattboston/sms-gateway/internal/models"
)

// setCreatedAt pins a message's timestamp. created_at only has second
// granularity, so tests that depend on ordering set it explicitly.
func setCreatedAt(t *testing.T, repo *Repository, id, createdAt string) {
	t.Helper()
	if _, err := repo.db.Exec(`UPDATE messages SET created_at = ? WHERE id = ?`, createdAt, id); err != nil {
		t.Fatalf("setting created_at: %v", err)
	}
}

func mustCreate(t *testing.T, repo *Repository, dir models.Direction, phone, body string, status models.MessageStatus) *models.Message {
	t.Helper()
	m, err := repo.CreateMessage(dir, phone, body, status, nil)
	if err != nil {
		t.Fatalf("CreateMessage() error = %v", err)
	}
	return m
}

func TestCreateMessage_NormalizesPhone(t *testing.T) {
	repo := setupTestDB(t)

	msg := mustCreate(t, repo, models.DirectionOutbound, "(555) 123-4567", "hi", models.StatusSent)
	if msg.PhoneNumber != "5551234567" {
		t.Errorf("msg.PhoneNumber = %q, want %q", msg.PhoneNumber, "5551234567")
	}
}

func TestListConversations_GroupsAndOrders(t *testing.T) {
	repo := setupTestDB(t)

	a1 := mustCreate(t, repo, models.DirectionOutbound, "+1 555 000 0001", "hello A", models.StatusSent)
	a2 := mustCreate(t, repo, models.DirectionInbound, "+15550000001", "reply A", models.StatusReceived)
	a3 := mustCreate(t, repo, models.DirectionInbound, "+15550000001", "again A", models.StatusRead)
	b1 := mustCreate(t, repo, models.DirectionInbound, "+15550000002", "hello B", models.StatusReceived)
	setCreatedAt(t, repo, a1.ID, "2026-01-01T10:00:00Z")
	setCreatedAt(t, repo, a2.ID, "2026-01-01T10:01:00Z")
	setCreatedAt(t, repo, a3.ID, "2026-01-01T10:03:00Z")
	setCreatedAt(t, repo, b1.ID, "2026-01-01T10:02:00Z")

	got, err := repo.ListConversations("", ListOptions{})
	if err != nil {
		t.Fatalf("ListConversations() error = %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("conversations = %d, want 2", len(got))
	}

	a := got[0]
	if a.PhoneNumber != "+15550000001" || a.LastMessage.ID != a3.ID {
		t.Errorf("first = %s/%s, want +15550000001/%s", a.PhoneNumber, a.LastMessage.ID, a3.ID)
	}
	if a.MessageCount != 3 || a.UnreadCount != 1 {
		t.Errorf("first counts = %d/%d, want 3/1", a.MessageCount, a.UnreadCount)
	}
	if got[1].PhoneNumber != "+15550000002" || got[1].UnreadCount != 1 {
		t.Errorf("second = %+v", got[1])
	}

	total, err := repo.CountConversations("")
	if err != nil || total != 2 {
		t.Errorf("CountConversations() = %d, %v; want 2", total, err)
	}
}

func TestListConversations_Search(t *testing.T) {
	repo := setupTestDB(t)

	pizza := mustCreate(t, repo, models.DirectionInbound, "+15550000001", "pizza tonight?", models.StatusReceived)
	latest := mustCreate(t, repo, models.DirectionInbound, "+15550000001", "latest", models.StatusReceived)
	setCreatedAt(t, repo, pizza.ID, "2026-01-01T10:00:00Z")
	setCreatedAt(t, repo, latest.ID, "2026-01-01T10:01:00Z")
	mustCreate(t, repo, models.DirectionInbound, "+15550000002", "100% sure", models.StatusReceived)
	mustCreate(t, repo, models.DirectionInbound, "+15550000003", "nothing", models.StatusReceived)

	tests := []struct {
		search    string
		wantPhone string
	}{
		{"pizza", "+15550000001"},   // matches an older message, still finds the thread
		{"0000002", "+15550000002"}, // matches the number
		{"100%", "+15550000002"},    // % is literal, not a wildcard
	}
	for _, tt := range tests {
		got, err := repo.ListConversations(tt.search, ListOptions{})
		if err != nil {
			t.Fatalf("ListConversations(%q) error = %v", tt.search, err)
		}
		if len(got) != 1 || got[0].PhoneNumber != tt.wantPhone {
			t.Errorf("ListConversations(%q) = %+v, want only %s", tt.search, got, tt.wantPhone)
		}
		// The thread is found by an older message but still previews its latest.
		if tt.search == "pizza" && (got[0].LastMessage.Body != "latest" || got[0].MessageCount != 2) {
			t.Errorf("search should not filter the thread's own messages: %+v", got[0])
		}
		if total, _ := repo.CountConversations(tt.search); total != 1 {
			t.Errorf("CountConversations(%q) = %d, want 1", tt.search, total)
		}
	}
}

func TestListConversations_Pagination(t *testing.T) {
	repo := setupTestDB(t)
	for _, phone := range []string{"1", "2", "3", "4", "5"} {
		mustCreate(t, repo, models.DirectionInbound, phone, "x", models.StatusReceived)
	}

	seen := map[string]bool{}
	for offset := 0; offset < 5; offset += 2 {
		page, err := repo.ListConversations("", ListOptions{Limit: 2, Offset: offset})
		if err != nil {
			t.Fatalf("ListConversations() error = %v", err)
		}
		for _, c := range page {
			if seen[c.PhoneNumber] {
				t.Errorf("conversation %s returned twice", c.PhoneNumber)
			}
			seen[c.PhoneNumber] = true
		}
	}
	if len(seen) != 5 {
		t.Errorf("saw %d conversations, want 5", len(seen))
	}
}

// TestListThread_CursorCoversEveryRowExactlyOnce pages backwards through a
// thread whose messages all share one timestamp, so only the id tiebreaker in
// the cursor keeps pages from overlapping or skipping rows.
func TestListThread_CursorCoversEveryRowExactlyOnce(t *testing.T) {
	repo := setupTestDB(t)
	for i := 0; i < 7; i++ {
		m := mustCreate(t, repo, models.DirectionInbound, "+1555", "x", models.StatusReceived)
		setCreatedAt(t, repo, m.ID, "2026-01-01T10:00:00Z")
	}
	mustCreate(t, repo, models.DirectionInbound, "+1999", "other thread", models.StatusReceived)

	seen := map[string]bool{}
	var before *models.Message
	for {
		page, err := repo.ListThread("+1555", before, 3)
		if err != nil {
			t.Fatalf("ListThread() error = %v", err)
		}
		if len(page) == 0 {
			break
		}
		for _, m := range page {
			if seen[m.ID] {
				t.Errorf("message %s returned twice", m.ID)
			}
			seen[m.ID] = true
		}
		last := page[len(page)-1]
		before = &last
	}
	if len(seen) != 7 {
		t.Errorf("saw %d messages, want 7", len(seen))
	}

	if total, _ := repo.CountThread("+1555"); total != 7 {
		t.Errorf("CountThread() = %d, want 7", total)
	}
}

func TestMarkConversationRead(t *testing.T) {
	repo := setupTestDB(t)
	mustCreate(t, repo, models.DirectionInbound, "+1555", "a", models.StatusReceived)
	mustCreate(t, repo, models.DirectionInbound, "+1555", "b", models.StatusReceived)
	mustCreate(t, repo, models.DirectionOutbound, "+1555", "c", models.StatusSent)
	other := mustCreate(t, repo, models.DirectionInbound, "+1999", "d", models.StatusReceived)

	n, err := repo.MarkConversationRead("+1555")
	if err != nil || n != 2 {
		t.Fatalf("MarkConversationRead() = %d, %v; want 2", n, err)
	}
	if m, _ := repo.GetMessage(other.ID); m.Status != models.StatusReceived {
		t.Errorf("other conversation status = %q, want received", m.Status)
	}
}

func TestDeleteConversation(t *testing.T) {
	repo := setupTestDB(t)
	mustCreate(t, repo, models.DirectionInbound, "+1555", "a", models.StatusReceived)
	mustCreate(t, repo, models.DirectionOutbound, "+1555", "b", models.StatusSent)
	mustCreate(t, repo, models.DirectionInbound, "+1999", "c", models.StatusReceived)

	n, err := repo.DeleteConversation("+1555")
	if err != nil || n != 2 {
		t.Fatalf("DeleteConversation() = %d, %v; want 2", n, err)
	}
	if total, _ := repo.CountConversations(""); total != 1 {
		t.Errorf("CountConversations() = %d, want 1", total)
	}
}
