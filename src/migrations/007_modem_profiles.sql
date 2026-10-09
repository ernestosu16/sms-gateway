-- +goose Up

-- Carrier setup profiles: ordered steps of AT commands an admin runs from the
-- WebUI to prepare a SIM on a given carrier. A profile is read and written as a
-- whole, so its steps live in one JSON document instead of child tables:
--   [{"title": "...", "commands": [{"command": "AT", "expect": "OK"}]}]
-- expect is an optional case-insensitive regular expression the response must
-- match for the command to count as passed.
CREATE TABLE modem_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- The seeded profile stores WebUI translation keys instead of text, so it
-- shows in the viewer's language. Text an admin types is stored as typed.
INSERT INTO modem_profiles (id, name, description, notes, steps) VALUES (
    '7f3c2a8e-5b1d-4c6f-9a2e-0d8b4e6f1a3c',
    'Tello USA',
    'modemSetup.seed.tello.description',
    'modemSetup.seed.tello.notes',
    '[
  {"title": "modemSetup.seed.step.checkModem", "commands": [
    {"command": "AT", "expect": "OK"},
    {"command": "AT+CPIN?", "expect": "READY"},
    {"command": "AT+CFUN?"},
    {"command": "AT+CMNB?"},
    {"command": "AT+CNMP?"}
  ]},
  {"title": "modemSetup.seed.step.configureLteM", "commands": [
    {"command": "AT+CMNB=1"},
    {"command": "AT+CFUN=0"},
    {"command": "AT+CFUN=1"}
  ]},
  {"title": "modemSetup.seed.step.checkRegistration", "commands": [
    {"command": "AT+CEREG=2"},
    {"command": "AT+CEREG?", "expect": "\\+CEREG:\\s*\\d,[15]"},
    {"command": "AT+CSPN?", "expect": "Tello"},
    {"command": "AT+COPS?", "expect": "Tello|T-Mobile"},
    {"command": "AT+CSQ"}
  ]},
  {"title": "modemSetup.seed.step.configureSms", "commands": [
    {"command": "AT+CMGF=1"},
    {"command": "AT+CMGF?", "expect": "\\+CMGF:\\s*1"},
    {"command": "AT+CSCA?"},
    {"command": "AT+CPSI?"}
  ]},
  {"title": "modemSetup.seed.step.listSms", "commands": [
    {"command": "AT+CMGL=\"ALL\""},
    {"command": "AT+CPMS?"}
  ]}
]'
);

-- +goose Down

DROP TABLE IF EXISTS modem_profiles;
