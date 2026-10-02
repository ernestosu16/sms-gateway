package main

import (
	"context"
	"testing"
	"time"

	"github.com/mattboston/sms-gateway/internal/auth"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/webhook"
	"github.com/mattboston/sms-gateway/internal/webhook/webhooktest"
)

func TestReceiveSMS_StoresAndNotifiesWebhooks(t *testing.T) {
	repo := webhooktest.NewRepository(t)
	subscribed := webhooktest.NewReceiver(t)
	other := webhooktest.NewReceiver(t)
	events := []models.WebhookEvent{models.EventMessageReceived}
	if _, err := repo.CreateWebhook("inbound", subscribed.URL, "whsec_test_secret_value", events, true); err != nil {
		t.Fatalf("CreateWebhook() error = %v", err)
	}
	outboundOnly := []models.WebhookEvent{models.EventMessageSent, models.EventMessageFailed}
	if _, err := repo.CreateWebhook("outbound", other.URL, "whsec_test_secret_value", outboundOnly, true); err != nil {
		t.Fatalf("CreateWebhook() error = %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	receive := receiveSMS(repo, webhook.NewDispatcher(ctx, repo))

	if err := receive("+15551234567", "Is the server back up?"); err != nil {
		t.Fatalf("receive() error = %v", err)
	}

	d := subscribed.Next(t)
	if d.Payload.Event != models.EventMessageReceived {
		t.Errorf("event = %q, want %q", d.Payload.Event, models.EventMessageReceived)
	}
	msg := d.Payload.Data
	if msg == nil || msg.Direction != models.DirectionInbound || msg.Status != models.StatusReceived ||
		msg.PhoneNumber != "+15551234567" || msg.Body != "Is the server back up?" {
		t.Fatalf("payload message = %+v", msg)
	}
	if msg.APIKeyID != nil || msg.ErrorMessage != nil {
		t.Errorf("inbound payload should omit api_key_id and error_message: %+v", msg)
	}

	stored, err := repo.GetMessage(msg.ID)
	if err != nil {
		t.Fatalf("GetMessage(%s) error = %v; webhook must describe a stored message", msg.ID, err)
	}
	if stored.Body != msg.Body {
		t.Errorf("stored body = %q, want %q", stored.Body, msg.Body)
	}

	other.ExpectNone(t, 200*time.Millisecond)
}

func TestPrepareAdminSeedsRandomPassword(t *testing.T) {
	repo := webhooktest.NewRepository(t)

	password, err := prepareAdmin(repo)
	if err != nil {
		t.Fatalf("prepareAdmin() error = %v", err)
	}
	if password == "" || password == legacyAdminPassword {
		t.Fatalf("prepareAdmin() password = %q, want a random one", password)
	}

	admin, err := repo.GetUserByUsername("admin")
	if err != nil {
		t.Fatalf("GetUserByUsername() error = %v", err)
	}
	if !admin.IsAdmin || !admin.MustChangePassword {
		t.Errorf("admin IsAdmin=%v MustChangePassword=%v, want both true", admin.IsAdmin, admin.MustChangePassword)
	}
	if !auth.CheckPassword(password, admin.PasswordHash) {
		t.Error("returned password does not match the stored hash")
	}

	again, err := prepareAdmin(repo)
	if err != nil || again != "" {
		t.Errorf("second prepareAdmin() = %q, %v; want no change", again, err)
	}
}

func TestPrepareAdminReplacesUnchangedLegacyPassword(t *testing.T) {
	tests := []struct {
		name        string
		password    string
		mustChange  bool
		wantReplace bool
	}{
		{name: "legacy password never changed", password: legacyAdminPassword, mustChange: true, wantReplace: true},
		{name: "legacy password chosen again", password: legacyAdminPassword, mustChange: false},
		{name: "own password", password: "an-own-password", mustChange: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := webhooktest.NewRepository(t)
			hash, _ := auth.HashPassword(tt.password)
			if _, err := repo.CreateUser("admin", hash, true, tt.mustChange); err != nil {
				t.Fatalf("CreateUser() error = %v", err)
			}

			password, err := prepareAdmin(repo)
			if err != nil {
				t.Fatalf("prepareAdmin() error = %v", err)
			}
			admin, _ := repo.GetUserByUsername("admin")

			if !tt.wantReplace {
				if password != "" || !auth.CheckPassword(tt.password, admin.PasswordHash) {
					t.Errorf("password was replaced (returned %q), want it kept", password)
				}
				return
			}
			if password == "" || auth.CheckPassword(legacyAdminPassword, admin.PasswordHash) {
				t.Fatal("legacy password was kept, want it replaced")
			}
			if !auth.CheckPassword(password, admin.PasswordHash) || !admin.MustChangePassword {
				t.Error("replacement must be the returned password and still require a change")
			}
		})
	}
}
