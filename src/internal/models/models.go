package models

import "time"

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

// SendSMSRequest is the request body for sending an SMS.
type SendSMSRequest struct {
	To   string `json:"to"`
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
}

// ATCommandResponse is the response body for a raw AT command.
type ATCommandResponse struct {
	Response string `json:"response"`
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
