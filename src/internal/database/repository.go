package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/mattboston/sms-gateway/internal/models"
)

// Repository provides data access methods for all domain entities.
type Repository struct {
	db *sql.DB
}

// NewRepository creates a new Repository wrapping the given database connection.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// Ping verifies the database connection is alive.
func (r *Repository) Ping() error {
	return r.db.Ping()
}

// --- Pagination ---

// ListOptions controls how a listing is paginated.
//
// A zero Limit means "no limit", which preserves the behavior callers had before
// pagination existed. Offset is only applied alongside a positive Limit: OFFSET
// without LIMIT is not portable across SQLite and PostgreSQL, and no caller
// needs it.
type ListOptions struct {
	Limit  int
	Offset int
}

// applyPagination appends the LIMIT/OFFSET clause for opts to a query.
//
// Every paginated listing goes through this so the "offset needs a limit" rule
// is enforced in exactly one place.
func applyPagination(query string, args []any, opts ListOptions) (string, []any) {
	if opts.Limit > 0 {
		query += ` LIMIT ?`
		args = append(args, opts.Limit)
		if opts.Offset > 0 {
			query += ` OFFSET ?`
			args = append(args, opts.Offset)
		}
	}
	return query, args
}

// --- Users ---

// CreateUser inserts a new user and returns the created user.
func (r *Repository) CreateUser(username, passwordHash string, isAdmin, mustChangePassword bool) (*models.User, error) {
	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	_, err := r.db.Exec(
		`INSERT INTO users (id, username, password_hash, is_admin, must_change_password, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, username, passwordHash, boolToInt(isAdmin), boolToInt(mustChangePassword), now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}

	return r.GetUserByID(id)
}

// SeedDefaultAdmin creates a default admin user if no users exist.
// Returns true if the seed user was created.
func (r *Repository) SeedDefaultAdmin(passwordHash string) (bool, error) {
	var count int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("checking user count: %w", err)
	}
	if count > 0 {
		return false, nil
	}

	_, err = r.CreateUser("admin", passwordHash, true, true)
	if err != nil {
		return false, fmt.Errorf("seeding default admin: %w", err)
	}
	return true, nil
}

// UpdatePassword updates a user's password and clears the must_change_password flag.
func (r *Repository) UpdatePassword(userID, passwordHash string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.Exec(
		`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
		passwordHash, now, userID,
	)
	if err != nil {
		return fmt.Errorf("updating password: %w", err)
	}
	return nil
}

// GetUserByID retrieves a user by their ID.
func (r *Repository) GetUserByID(id string) (*models.User, error) {
	row := r.db.QueryRow(
		`SELECT id, username, password_hash, is_admin, must_change_password, created_at, updated_at
		 FROM users WHERE id = ?`, id,
	)
	return scanUser(row)
}

// GetUserByUsername retrieves a user by their username.
func (r *Repository) GetUserByUsername(username string) (*models.User, error) {
	row := r.db.QueryRow(
		`SELECT id, username, password_hash, is_admin, must_change_password, created_at, updated_at
		 FROM users WHERE username = ?`, username,
	)
	return scanUser(row)
}

// ListUsers returns users newest first, limited according to opts.
func (r *Repository) ListUsers(opts ListOptions) ([]models.User, error) {
	// id breaks created_at ties for the same reason it does for messages: the
	// column has second granularity, so paging needs a stable total order.
	query, args := applyPagination(
		`SELECT id, username, password_hash, is_admin, must_change_password, created_at, updated_at
		 FROM users ORDER BY created_at DESC, id DESC`,
		nil, opts,
	)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		u, err := scanUserRows(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}
	return users, rows.Err()
}

// CountUsers returns the total number of users, ignoring any pagination window.
func (r *Repository) CountUsers() (int, error) {
	var total int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&total); err != nil {
		return 0, fmt.Errorf("counting users: %w", err)
	}
	return total, nil
}

// --- API Keys ---

// CreateAPIKey inserts a new API key and returns it.
func (r *Repository) CreateAPIKey(key, label, userID string) (*models.APIKey, error) {
	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	_, err := r.db.Exec(
		`INSERT INTO api_keys (id, key, label, user_id, is_active, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 1, ?, ?)`,
		id, key, label, userID, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("creating API key: %w", err)
	}

	return r.getAPIKeyByID(id)
}

// GetAPIKeyByKey retrieves an active API key by its key value.
func (r *Repository) GetAPIKeyByKey(key string) (*models.APIKey, error) {
	row := r.db.QueryRow(
		`SELECT id, key, label, user_id, is_active, created_at, updated_at
		 FROM api_keys WHERE key = ? AND is_active = 1`, key,
	)
	return scanAPIKey(row)
}

func (r *Repository) getAPIKeyByID(id string) (*models.APIKey, error) {
	row := r.db.QueryRow(
		`SELECT id, key, label, user_id, is_active, created_at, updated_at
		 FROM api_keys WHERE id = ?`, id,
	)
	return scanAPIKey(row)
}

// apiKeyColumns is the column list shared by every API key SELECT.
const apiKeyColumns = `id, key, label, user_id, is_active, created_at, updated_at`

// ListAPIKeys returns API keys newest first, limited according to opts.
func (r *Repository) ListAPIKeys(opts ListOptions) ([]models.APIKey, error) {
	return r.listAPIKeys("", opts)
}

// ListAPIKeysByUserID returns one user's API keys, newest first, limited
// according to opts.
func (r *Repository) ListAPIKeysByUserID(userID string, opts ListOptions) ([]models.APIKey, error) {
	return r.listAPIKeys(userID, opts)
}

// listAPIKeys backs both listings. An empty userID means "all users", which
// keeps the filter identical to the one countAPIKeys applies.
func (r *Repository) listAPIKeys(userID string, opts ListOptions) ([]models.APIKey, error) {
	where, args := apiKeyFilter(userID)
	query, args := applyPagination(
		`SELECT `+apiKeyColumns+` FROM api_keys`+where+` ORDER BY created_at DESC, id DESC`,
		args, opts,
	)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("listing API keys: %w", err)
	}
	defer rows.Close()

	var keys []models.APIKey
	for rows.Next() {
		k, err := scanAPIKeyRows(rows)
		if err != nil {
			return nil, err
		}
		keys = append(keys, *k)
	}
	return keys, rows.Err()
}

// apiKeyFilter builds the WHERE clause shared by the listing and count queries
// so the two can never drift apart and report inconsistent totals.
func apiKeyFilter(userID string) (string, []any) {
	if userID == "" {
		return "", nil
	}
	return ` WHERE user_id = ?`, []any{userID}
}

// CountAPIKeys returns the total number of API keys, ignoring any pagination
// window. An empty userID counts keys across all users.
func (r *Repository) CountAPIKeys(userID string) (int, error) {
	where, args := apiKeyFilter(userID)

	var total int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM api_keys`+where, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("counting API keys: %w", err)
	}
	return total, nil
}

// apiKeyByIDFilter builds the WHERE clause that selects one API key for an
// update or delete. A non-empty userID also requires that user to own the key,
// so a caller acting for a non-admin cannot touch anyone else's keys; an empty
// userID matches any owner.
func apiKeyByIDFilter(id, userID string) (string, []any) {
	if userID == "" {
		return ` WHERE id = ?`, []any{id}
	}
	return ` WHERE id = ? AND user_id = ?`, []any{id, userID}
}

// DeactivateAPIKey marks an API key as inactive. userID scopes the change as
// in apiKeyByIDFilter. The error wraps sql.ErrNoRows when no matching key
// exists.
func (r *Repository) DeactivateAPIKey(id, userID string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	where, args := apiKeyByIDFilter(id, userID)
	result, err := r.db.Exec(`UPDATE api_keys SET is_active = 0, updated_at = ?`+where, append([]any{now}, args...)...)
	if err != nil {
		return fmt.Errorf("deactivating API key: %w", err)
	}
	return requireRowAffected(result, "deactivating API key")
}

// DeleteAPIKey permanently removes an API key. userID scopes the change as in
// apiKeyByIDFilter. The error wraps sql.ErrNoRows when no matching key exists.
func (r *Repository) DeleteAPIKey(id, userID string) error {
	where, args := apiKeyByIDFilter(id, userID)
	result, err := r.db.Exec(`DELETE FROM api_keys`+where, args...)
	if err != nil {
		return fmt.Errorf("deleting API key: %w", err)
	}
	return requireRowAffected(result, "deleting API key")
}

// requireRowAffected returns an error wrapping sql.ErrNoRows when result
// changed no rows.
func requireRowAffected(result sql.Result, action string) error {
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("%s: checking rows affected: %w", action, err)
	}
	if rows == 0 {
		return fmt.Errorf("%s: %w", action, sql.ErrNoRows)
	}
	return nil
}

// --- Messages ---

// CreateMessage inserts a new message and returns it.
func (r *Repository) CreateMessage(direction models.Direction, phoneNumber, body string, status models.MessageStatus, apiKeyID *string) (*models.Message, error) {
	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	_, err := r.db.Exec(
		`INSERT INTO messages (id, direction, phone_number, body, status, api_key_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, string(direction), phoneNumber, body, string(status), apiKeyID, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("creating message: %w", err)
	}

	return r.GetMessage(id)
}

// GetMessage retrieves a message by ID.
func (r *Repository) GetMessage(id string) (*models.Message, error) {
	row := r.db.QueryRow(
		`SELECT id, direction, phone_number, body, status, api_key_id, modem_response, error_message, created_at, updated_at
		 FROM messages WHERE id = ?`, id,
	)
	return scanMessage(row)
}

// messageColumns is the column list shared by every message SELECT.
const messageColumns = `id, direction, phone_number, body, status, api_key_id, modem_response, error_message, created_at, updated_at`

// messageFilter builds the WHERE clause shared by ListMessages and CountMessages
// so the two can never drift apart and report inconsistent totals.
func messageFilter(direction models.Direction, status *models.MessageStatus) (string, []any) {
	where := ` WHERE direction = ?`
	args := []any{string(direction)}
	if status != nil {
		where += ` AND status = ?`
		args = append(args, string(*status))
	}
	return where, args
}

// ListMessages returns messages filtered by direction and optionally status,
// newest first, limited according to opts.
func (r *Repository) ListMessages(direction models.Direction, status *models.MessageStatus, opts ListOptions) ([]models.Message, error) {
	where, args := messageFilter(direction, status)

	// created_at is stored with second granularity, so it is not unique. Ordering
	// by it alone leaves rows created in the same second in an arbitrary order,
	// which lets pagination repeat or skip them across page boundaries. Breaking
	// the tie on id gives the listing a stable total order.
	query, args := applyPagination(
		`SELECT `+messageColumns+` FROM messages`+where+` ORDER BY created_at DESC, id DESC`,
		args, opts,
	)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("listing messages: %w", err)
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		m, err := scanMessageRows(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, *m)
	}
	return messages, rows.Err()
}

// CountMessages returns the total number of messages matching the same filter
// ListMessages applies, ignoring any pagination window.
func (r *Repository) CountMessages(direction models.Direction, status *models.MessageStatus) (int, error) {
	where, args := messageFilter(direction, status)

	var total int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM messages`+where, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("counting messages: %w", err)
	}
	return total, nil
}

// MessageStats returns message counts aggregated by direction and status.
//
// The dashboard needs status-filtered totals across the whole table, which a
// single page of results cannot provide. Aggregating in SQL keeps it O(1)
// requests instead of downloading every message to count them client-side.
func (r *Repository) MessageStats() (*models.MessageStats, error) {
	rows, err := r.db.Query(`SELECT direction, status, COUNT(*) FROM messages GROUP BY direction, status`)
	if err != nil {
		return nil, fmt.Errorf("aggregating message stats: %w", err)
	}
	defer rows.Close()

	stats := &models.MessageStats{ByStatus: map[string]int{}}
	for rows.Next() {
		var direction, status string
		var count int
		if err := rows.Scan(&direction, &status, &count); err != nil {
			return nil, fmt.Errorf("scanning message stats: %w", err)
		}

		stats.ByStatus[direction+"."+status] = count
		stats.Total += count
		switch models.Direction(direction) {
		case models.DirectionInbound:
			stats.Inbound += count
			if models.MessageStatus(status) == models.StatusReceived {
				stats.Unread += count
			}
		case models.DirectionOutbound:
			stats.Outbound += count
			switch models.MessageStatus(status) {
			case models.StatusSent:
				stats.Sent += count
			case models.StatusPending, models.StatusSending:
				stats.Pending += count
			case models.StatusFailed:
				stats.Failed += count
			}
		}
	}
	return stats, rows.Err()
}

// UpdateMessageStatus updates the status and optionally the modem response or error of a message.
func (r *Repository) UpdateMessageStatus(id string, status models.MessageStatus, modemResponse, errorMessage *string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.Exec(
		`UPDATE messages SET status = ?, modem_response = ?, error_message = ?, updated_at = ? WHERE id = ?`,
		string(status), modemResponse, errorMessage, now, id,
	)
	if err != nil {
		return fmt.Errorf("updating message status: %w", err)
	}
	return nil
}

// MarkMessageRead updates an inbound message's status from "received" to "read".
func (r *Repository) MarkMessageRead(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(
		`UPDATE messages SET status = ?, updated_at = ? WHERE id = ? AND direction = ? AND status = ?`,
		string(models.StatusRead), now, id, string(models.DirectionInbound), string(models.StatusReceived),
	)
	if err != nil {
		return fmt.Errorf("marking message as read: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("message not found or already read")
	}
	return nil
}

// MarkMessageUnread updates an inbound message's status from "read" back to "received".
func (r *Repository) MarkMessageUnread(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(
		`UPDATE messages SET status = ?, updated_at = ? WHERE id = ? AND direction = ? AND status = ?`,
		string(models.StatusReceived), now, id, string(models.DirectionInbound), string(models.StatusRead),
	)
	if err != nil {
		return fmt.Errorf("marking message as unread: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("message not found or already unread")
	}
	return nil
}

// DeleteMessage deletes a message by ID. Returns an error if the message does not exist.
func (r *Repository) DeleteMessage(id string) error {
	result, err := r.db.Exec(`DELETE FROM messages WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("deleting message: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("message not found")
	}
	return nil
}

// GetPendingMessages returns all outbound messages with pending status.
func (r *Repository) GetPendingMessages() ([]models.Message, error) {
	status := models.StatusPending
	return r.ListMessages(models.DirectionOutbound, &status, ListOptions{})
}

// --- Webhooks ---

// webhookColumns is the column list shared by every webhook SELECT.
const webhookColumns = `id, name, url, secret, events, is_active, created_at, updated_at`

// CreateWebhook inserts a new webhook and returns it.
func (r *Repository) CreateWebhook(name, url, secret string, events []models.WebhookEvent, isActive bool) (*models.Webhook, error) {
	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	_, err := r.db.Exec(
		`INSERT INTO webhooks (id, name, url, secret, events, is_active, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, name, url, secret, joinWebhookEvents(events), boolToInt(isActive), now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("creating webhook: %w", err)
	}

	return r.GetWebhook(id)
}

// GetWebhook retrieves a webhook by ID. The error wraps sql.ErrNoRows when no
// webhook has that ID.
func (r *Repository) GetWebhook(id string) (*models.Webhook, error) {
	row := r.db.QueryRow(`SELECT `+webhookColumns+` FROM webhooks WHERE id = ?`, id)
	return scanWebhook(row)
}

// ListWebhooks returns webhooks newest first, limited according to opts.
func (r *Repository) ListWebhooks(opts ListOptions) ([]models.Webhook, error) {
	query, args := applyPagination(
		`SELECT `+webhookColumns+` FROM webhooks ORDER BY created_at DESC, id DESC`,
		nil, opts,
	)
	return r.queryWebhooks(query, args...)
}

// ListActiveWebhooks returns every webhook that should receive deliveries.
func (r *Repository) ListActiveWebhooks() ([]models.Webhook, error) {
	return r.queryWebhooks(`SELECT ` + webhookColumns + ` FROM webhooks WHERE is_active = 1`)
}

func (r *Repository) queryWebhooks(query string, args ...any) ([]models.Webhook, error) {
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("listing webhooks: %w", err)
	}
	defer rows.Close()

	var webhooks []models.Webhook
	for rows.Next() {
		w, err := scanWebhook(rows)
		if err != nil {
			return nil, err
		}
		webhooks = append(webhooks, *w)
	}
	return webhooks, rows.Err()
}

// CountWebhooks returns the total number of webhooks, ignoring any pagination
// window.
func (r *Repository) CountWebhooks() (int, error) {
	var total int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM webhooks`).Scan(&total); err != nil {
		return 0, fmt.Errorf("counting webhooks: %w", err)
	}
	return total, nil
}

// UpdateWebhook saves every editable field of w and returns the stored webhook.
// The error wraps sql.ErrNoRows when no webhook has w.ID.
func (r *Repository) UpdateWebhook(w *models.Webhook) (*models.Webhook, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(
		`UPDATE webhooks SET name = ?, url = ?, secret = ?, events = ?, is_active = ?, updated_at = ? WHERE id = ?`,
		w.Name, w.URL, w.Secret, joinWebhookEvents(w.Events), boolToInt(w.IsActive), now, w.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating webhook: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("checking rows affected: %w", err)
	}
	if rows == 0 {
		return nil, fmt.Errorf("updating webhook: %w", sql.ErrNoRows)
	}
	return r.GetWebhook(w.ID)
}

// DeleteWebhook permanently removes a webhook by ID. The error wraps
// sql.ErrNoRows when no webhook has that ID.
func (r *Repository) DeleteWebhook(id string) error {
	result, err := r.db.Exec(`DELETE FROM webhooks WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("deleting webhook: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("deleting webhook: %w", sql.ErrNoRows)
	}
	return nil
}

// joinWebhookEvents encodes events for the comma-separated events column.
// Event names never contain commas, so no escaping is needed.
func joinWebhookEvents(events []models.WebhookEvent) string {
	names := make([]string, len(events))
	for i, e := range events {
		names[i] = string(e)
	}
	return strings.Join(names, ",")
}

// --- Scan helpers ---

type scannable interface {
	Scan(dest ...interface{}) error
}

func scanUser(s scannable) (*models.User, error) {
	var u models.User
	var isAdmin, mustChangePassword int
	var createdAt, updatedAt string
	err := s.Scan(&u.ID, &u.Username, &u.PasswordHash, &isAdmin, &mustChangePassword, &createdAt, &updatedAt)
	if err != nil {
		return nil, fmt.Errorf("scanning user: %w", err)
	}
	u.IsAdmin = isAdmin != 0
	u.MustChangePassword = mustChangePassword != 0
	u.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	u.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	return &u, nil
}

func scanUserRows(rows *sql.Rows) (*models.User, error) {
	return scanUser(rows)
}

func scanAPIKey(s scannable) (*models.APIKey, error) {
	var k models.APIKey
	var isActive int
	var createdAt, updatedAt string
	err := s.Scan(&k.ID, &k.Key, &k.Label, &k.UserID, &isActive, &createdAt, &updatedAt)
	if err != nil {
		return nil, fmt.Errorf("scanning API key: %w", err)
	}
	k.IsActive = isActive != 0
	k.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	k.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	return &k, nil
}

func scanAPIKeyRows(rows *sql.Rows) (*models.APIKey, error) {
	return scanAPIKey(rows)
}

func scanMessage(s scannable) (*models.Message, error) {
	var m models.Message
	var direction, status string
	var createdAt, updatedAt string
	err := s.Scan(&m.ID, &direction, &m.PhoneNumber, &m.Body, &status, &m.APIKeyID, &m.ModemResponse, &m.ErrorMessage, &createdAt, &updatedAt)
	if err != nil {
		return nil, fmt.Errorf("scanning message: %w", err)
	}
	m.Direction = models.Direction(direction)
	m.Status = models.MessageStatus(status)
	m.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	m.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	return &m, nil
}

func scanMessageRows(rows *sql.Rows) (*models.Message, error) {
	return scanMessage(rows)
}

func scanWebhook(s scannable) (*models.Webhook, error) {
	var w models.Webhook
	var events string
	var isActive int
	var createdAt, updatedAt string
	err := s.Scan(&w.ID, &w.Name, &w.URL, &w.Secret, &events, &isActive, &createdAt, &updatedAt)
	if err != nil {
		return nil, fmt.Errorf("scanning webhook: %w", err)
	}
	w.Events = []models.WebhookEvent{}
	for _, name := range strings.Split(events, ",") {
		if name != "" {
			w.Events = append(w.Events, models.WebhookEvent(name))
		}
	}
	w.IsActive = isActive != 0
	w.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	w.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	return &w, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
