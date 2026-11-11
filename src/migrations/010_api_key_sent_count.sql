-- +goose Up

-- How many SMS each API key has sent, simulated sends of a test key included.
-- A stored counter rather than a COUNT over messages, so deleting messages or
-- conversations does not lower it.
ALTER TABLE api_keys ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0;

-- Start existing keys from the sent messages still on record.
UPDATE api_keys SET sent_count = (
    SELECT COUNT(*) FROM messages
    WHERE messages.api_key_id = api_keys.id
      AND messages.direction = 'outbound'
      AND messages.status = 'sent'
);

-- +goose Down

ALTER TABLE api_keys DROP COLUMN sent_count;
