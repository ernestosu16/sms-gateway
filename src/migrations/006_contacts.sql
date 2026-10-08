-- +goose Up

-- Display names for phone numbers. phone_number uses the same normalized form
-- as messages.phone_number, so a contact joins straight onto its conversation.
-- A contact outlives its messages: deleting a conversation keeps the name for
-- when the number writes again.
CREATE TABLE contacts (
    phone_number TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- +goose Down

DROP TABLE IF EXISTS contacts;
