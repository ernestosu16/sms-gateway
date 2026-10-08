-- +goose Up

-- The WebUI groups messages into conversations by phone_number. Outbound
-- numbers used to be stored exactly as typed ("555-123-4567") while the modem
-- reports inbound numbers without formatting, so one contact could split into
-- several threads. New writes go through models.NormalizePhone; this applies the
-- same rule to existing rows.
--
-- Not reversed on Down: the stripped characters carry no information, and the
-- original spelling cannot be recovered anyway.
UPDATE messages
SET phone_number = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(phone_number), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
WHERE phone_number <> REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(phone_number), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '');

-- A thread is "WHERE phone_number = ? ORDER BY created_at DESC, id DESC", and the
-- conversation list picks the newest message per phone_number with the same
-- ordering. One index serves both without a sort.
CREATE INDEX idx_messages_phone_created_at ON messages(phone_number, created_at DESC, id DESC);

-- +goose Down

DROP INDEX IF EXISTS idx_messages_phone_created_at;
