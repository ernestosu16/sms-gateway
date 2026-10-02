-- +goose Up

-- Outgoing webhooks notified when message events happen. events holds a
-- comma-separated list of event names (e.g. "message.received,message.sent");
-- the secret is stored in plain text because it must be read back to sign
-- every delivery.
CREATE TABLE webhooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- +goose Down

DROP TABLE IF EXISTS webhooks;
