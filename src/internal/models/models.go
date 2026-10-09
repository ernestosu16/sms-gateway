package models

import (
	"strings"
	"time"
)

// Direction represents the direction of a message.
type Direction string

const (
	DirectionInbound  Direction = "inbound"
	DirectionOutbound Direction = "outbound"
)

// MessageStatus represents the status of a message.
type MessageStatus string

const (
	StatusPending  MessageStatus = "pending"
	StatusSending  MessageStatus = "sending"
	StatusSent     MessageStatus = "sent"
	StatusFailed   MessageStatus = "failed"
	StatusReceived MessageStatus = "received"
	StatusRead     MessageStatus = "read"
)

// User represents a user account.
type User struct {
	ID                 string    `json:"id"`
	Username           string    `json:"username"`
	PasswordHash       string    `json:"-"`
	IsAdmin            bool      `json:"is_admin"`
	MustChangePassword bool      `json:"must_change_password"`
	TokenVersion       int       `json:"-"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// APIKey represents an API key for authenticating requests.
type APIKey struct {
	ID string `json:"id"`
	// Key is the plaintext key, set only in the response that creates it.
	Key       string    `json:"key,omitempty"`
	Label     string    `json:"label"`
	UserID    string    `json:"user_id"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Message represents an SMS message.
type Message struct {
	ID            string        `json:"id"`
	Direction     Direction     `json:"direction"`
	PhoneNumber   string        `json:"phone_number"`
	Body          string        `json:"body"`
	Status        MessageStatus `json:"status"`
	APIKeyID      *string       `json:"api_key_id,omitempty"`
	ModemResponse *string       `json:"modem_response,omitempty"`
	ErrorMessage  *string       `json:"error_message,omitempty"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

// WebhookEvent names an event a webhook can subscribe to.
type WebhookEvent string

const (
	// EventMessageReceived fires when an inbound SMS is stored.
	EventMessageReceived WebhookEvent = "message.received"
	// EventMessageSent fires when the modem accepts an outbound SMS.
	EventMessageSent WebhookEvent = "message.sent"
	// EventMessageFailed fires when the modem rejects an outbound SMS.
	EventMessageFailed WebhookEvent = "message.failed"
)

// WebhookEvents lists every event a webhook may subscribe to.
var WebhookEvents = []WebhookEvent{EventMessageReceived, EventMessageSent, EventMessageFailed}

// Webhook is an HTTP endpoint notified when subscribed message events happen.
type Webhook struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	URL       string         `json:"url"`
	Secret    string         `json:"secret"`
	Events    []WebhookEvent `json:"events"`
	IsActive  bool           `json:"is_active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

// WebhookRequest is the request body for creating or updating a webhook.
//
// An empty Secret generates one on create and keeps the current one on update.
// A nil IsActive means active on create and unchanged on update.
type WebhookRequest struct {
	Name     string         `json:"name"`
	URL      string         `json:"url"`
	Secret   string         `json:"secret,omitempty"`
	Events   []WebhookEvent `json:"events"`
	IsActive *bool          `json:"is_active,omitempty"`
}

// WebhookPayload is the JSON body POSTed to a webhook URL.
//
// ID identifies the event, not the attempt: retries resend the same ID so
// receivers can discard duplicates.
type WebhookPayload struct {
	ID        string       `json:"id"`
	Event     WebhookEvent `json:"event"`
	CreatedAt time.Time    `json:"created_at"`
	Data      *Message     `json:"data"`
}

// phoneFormatting holds the characters people type to make a number readable.
// They carry no meaning for the modem, so stripping them lets "555-123-4567"
// and "555 123 4567" land in the same conversation.
var phoneFormatting = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "", ".", "")

// NormalizePhone strips formatting characters from a phone number so every
// message to or from the same number groups into one conversation.
//
// It deliberately does not infer a country code: "5551234567" and
// "+15551234567" stay distinct because guessing the country could merge
// unrelated numbers. Alphanumeric sender IDs (e.g. "BANK") pass through
// untouched apart from the same stripping.
//
// Migration 005 applies the same rule in SQL to rows written before this
// existed; keep the two in sync.
func NormalizePhone(s string) string {
	return phoneFormatting.Replace(strings.TrimSpace(s))
}

// Conversation summarizes every message exchanged with one phone number.
type Conversation struct {
	PhoneNumber  string  `json:"phone_number"`
	LastMessage  Message `json:"last_message"`
	MessageCount int     `json:"message_count"`
	// UnreadCount is the number of inbound messages still in "received" status.
	UnreadCount int `json:"unread_count"`
	// ContactName is the saved name for the number, empty when there is none.
	ContactName string `json:"contact_name,omitempty"`
}

// MaxContactNameRunes bounds a contact name so it fits list rows and headers.
const MaxContactNameRunes = 100

// Contact is a display name saved for a phone number.
type Contact struct {
	PhoneNumber string    `json:"phone_number"`
	Name        string    `json:"name"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ContactRequest is the request body for saving a contact's name.
type ContactRequest struct {
	Name string `json:"name" example:"Jane Doe"`
}

// ConversationUpdateResponse reports how many messages a conversation-wide
// action touched.
type ConversationUpdateResponse struct {
	Affected int64 `json:"affected"`
}

// SendSMSRequest is the request body for sending an SMS.
type SendSMSRequest struct {
	// To is an international number with + and country code (spaces, dashes,
	// dots and parentheses are ignored) or a 3-6 digit short code.
	To   string `json:"to" example:"+15551234567"`
	Body string `json:"body"`
}

// SendSMSResponse is the response body after sending an SMS.
type SendSMSResponse struct {
	ID      string        `json:"id"`
	Status  MessageStatus `json:"status"`
	Message string        `json:"message,omitempty"`
}

// MessageStats holds message counts aggregated across the whole table.
//
// These are whole-table aggregates rather than page-scoped counts, so the
// dashboard can show accurate totals without downloading every message.
type MessageStats struct {
	Total    int `json:"total"`
	Inbound  int `json:"inbound"`
	Outbound int `json:"outbound"`
	Unread   int `json:"unread"`
	Sent     int `json:"sent"`
	Pending  int `json:"pending"`
	Failed   int `json:"failed"`
	// ByStatus is keyed "<direction>.<status>", e.g. "outbound.sent", so clients
	// can read counts this struct does not name explicitly.
	ByStatus map[string]int `json:"by_status"`
}

// LoginRequest is the request body for logging in.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse is the response body after logging in.
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// CreateAPIKeyRequest is the request body for creating an API key.
type CreateAPIKeyRequest struct {
	Label string `json:"label"`
}

// CreateAPIKeyResponse is the response body after creating an API key.
type CreateAPIKeyResponse struct {
	APIKey APIKey `json:"api_key"`
}

// CreateUserRequest is the request body for creating a user.
type CreateUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	IsAdmin  bool   `json:"is_admin"`
}

// ModemStatusResponse is the response body for modem status.
type ModemStatusResponse struct {
	Status string `json:"status"`
}

// ModemSignalResponse is the response body for modem signal strength.
type ModemSignalResponse struct {
	Signal  int    `json:"signal"`
	Quality string `json:"quality"`
}

// ATCommandRequest is the request body for sending a raw AT command.
type ATCommandRequest struct {
	Command string `json:"command"`
	// Confirm must be true to run a dangerous or unrecognised command.
	Confirm bool `json:"confirm,omitempty"`
}

// ATConfirmationRequired is returned with 409 when a command needs Confirm.
type ATConfirmationRequired struct {
	Error                string `json:"error"`
	RequiresConfirmation bool   `json:"requires_confirmation"`
	// Risk is "dangerous" or "unknown".
	Risk    string `json:"risk"`
	Warning string `json:"warning,omitempty"`
	// Title names the recognised command, when there is one.
	Title string `json:"title,omitempty"`
}

// ATCommandResponse is the response body for a raw AT command.
type ATCommandResponse struct {
	Response string `json:"response"`
}

// ModemProfile is a carrier setup recipe: ordered steps of AT commands an
// admin runs to prepare a SIM on that carrier.
type ModemProfile struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Notes       string        `json:"notes"`
	Steps       []ProfileStep `json:"steps"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
}

// ProfileStep is a titled group of AT commands run in order.
type ProfileStep struct {
	Title    string           `json:"title"`
	Commands []ProfileCommand `json:"commands"`
}

// ProfileCommand is one AT command of a profile step.
type ProfileCommand struct {
	Command string `json:"command"`
	// Expect is an optional case-insensitive regular expression the response
	// must match for the command to count as passed.
	Expect string `json:"expect,omitempty"`
}

// ModemProfileRequest is the request body for creating or updating a modem
// profile.
type ModemProfileRequest struct {
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Notes       string        `json:"notes"`
	Steps       []ProfileStep `json:"steps"`
}

// ChangePasswordRequest is the request body for changing a password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePasswordResponse is the response body after changing a password. Token
// replaces the caller's token, which the change revoked.
type ChangePasswordResponse struct {
	Message string `json:"message"`
	Token   string `json:"token"`
}

// ErrorResponse represents an API error.
type ErrorResponse struct {
	Error string `json:"error"`
}
