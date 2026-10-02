-- +goose Up

-- JWTs carry the token_version they were issued with. Bumping it (on logout or
-- password change) invalidates every token issued before, since JWTs are
-- otherwise valid until they expire.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

-- +goose Down

ALTER TABLE users DROP COLUMN token_version;
