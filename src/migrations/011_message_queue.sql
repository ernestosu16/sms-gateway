-- +goose Up

-- Position of an outbound message in the send queue, set when it is queued
-- because the modem is unavailable. created_at has second granularity, so it
-- cannot order messages queued in the same second; this can.
ALTER TABLE messages ADD COLUMN queue_seq INTEGER;

CREATE INDEX idx_messages_queue ON messages(status, queue_seq);

-- +goose Down

DROP INDEX idx_messages_queue;
ALTER TABLE messages DROP COLUMN queue_seq;
