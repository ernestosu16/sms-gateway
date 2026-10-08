package database

import (
	"database/sql"
	"errors"
	"testing"

	"github.com/mattboston/sms-gateway/internal/models"
)

func TestSaveContact_CreatesThenRenames(t *testing.T) {
	repo := setupTestDB(t)

	c, err := repo.SaveContact("+1 555 000 0001", "Jane")
	if err != nil {
		t.Fatalf("SaveContact() error = %v", err)
	}
	if c.PhoneNumber != "+15550000001" || c.Name != "Jane" {
		t.Errorf("contact = %+v, want +15550000001/Jane", c)
	}

	if _, err := repo.SaveContact("+15550000001", "Jane Doe"); err != nil {
		t.Fatalf("SaveContact(rename) error = %v", err)
	}
	if got, _ := repo.GetContact("+15550000001"); got.Name != "Jane Doe" {
		t.Errorf("renamed contact = %q, want Jane Doe", got.Name)
	}
	if total, _ := repo.CountContacts(""); total != 1 {
		t.Errorf("CountContacts() = %d, want 1 (rename must not duplicate)", total)
	}
}

func TestListContacts_SearchAndOrder(t *testing.T) {
	repo := setupTestDB(t)
	_, _ = repo.SaveContact("+15550000001", "zoe")
	_, _ = repo.SaveContact("+15550000002", "Adam")
	_, _ = repo.SaveContact("+15550000003", "bob")

	all, err := repo.ListContacts("", ListOptions{})
	if err != nil {
		t.Fatalf("ListContacts() error = %v", err)
	}
	if len(all) != 3 || all[0].Name != "Adam" || all[1].Name != "bob" || all[2].Name != "zoe" {
		t.Errorf("order = %+v, want case-insensitive Adam, bob, zoe", all)
	}

	found, _ := repo.ListContacts("0003", ListOptions{})
	if len(found) != 1 || found[0].Name != "bob" {
		t.Errorf("search by number = %+v, want bob", found)
	}
}

func TestDeleteContact_KeepsMessages(t *testing.T) {
	repo := setupTestDB(t)
	mustCreate(t, repo, models.DirectionInbound, "+15550000001", "hi", models.StatusReceived)
	_, _ = repo.SaveContact("+15550000001", "Jane")

	if err := repo.DeleteContact("+15550000001"); err != nil {
		t.Fatalf("DeleteContact() error = %v", err)
	}
	if err := repo.DeleteContact("+15550000001"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("second DeleteContact() error = %v, want sql.ErrNoRows", err)
	}
	if total, _ := repo.CountThread("+15550000001"); total != 1 {
		t.Errorf("messages after deleting contact = %d, want 1", total)
	}
}

func TestListConversations_ContactName(t *testing.T) {
	repo := setupTestDB(t)
	mustCreate(t, repo, models.DirectionInbound, "+15550000001", "hello", models.StatusReceived)
	mustCreate(t, repo, models.DirectionInbound, "+15550000002", "other", models.StatusReceived)
	_, _ = repo.SaveContact("+15550000001", "Jane Doe")

	all, err := repo.ListConversations("", ListOptions{})
	if err != nil {
		t.Fatalf("ListConversations() error = %v", err)
	}
	names := map[string]string{}
	for _, c := range all {
		names[c.PhoneNumber] = c.ContactName
	}
	if names["+15550000001"] != "Jane Doe" || names["+15550000002"] != "" {
		t.Errorf("contact names = %v", names)
	}

	// Searching by name finds the conversation even though no message or
	// number contains the text.
	found, _ := repo.ListConversations("jane", ListOptions{})
	if len(found) != 1 || found[0].PhoneNumber != "+15550000001" {
		t.Errorf("search by name = %+v, want only +15550000001", found)
	}
	if total, _ := repo.CountConversations("jane"); total != 1 {
		t.Errorf("CountConversations(jane) = %d, want 1", total)
	}
}
