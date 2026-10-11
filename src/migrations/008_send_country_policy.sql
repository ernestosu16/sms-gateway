-- +goose Up

-- Which countries outbound SMS may be sent to. A single row (id = 1) holds the
-- policy; inbound SMS is never restricted. countries is a comma-separated list
-- of ISO 3166-1 alpha-2 codes, only used when mode is 'selected'. The default
-- allows every destination, as before this table existed.
CREATE TABLE send_country_policy (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'all' CHECK (mode IN ('all', 'none', 'selected')),
    countries TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO send_country_policy (id) VALUES (1);

-- +goose Down

DROP TABLE IF EXISTS send_country_policy;
