-- +goose Up

-- A test API key reads like any other key, but an SMS it sends is simulated:
-- stored and reported to webhooks as sent without ever reaching the modem.
-- Existing keys stay live.
ALTER TABLE api_keys ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;

-- Marks a message that a test API key "sent" without using the modem.
ALTER TABLE messages ADD COLUMN is_simulated INTEGER NOT NULL DEFAULT 0;

-- +goose Down

ALTER TABLE messages DROP COLUMN is_simulated;
ALTER TABLE api_keys DROP COLUMN is_test;
