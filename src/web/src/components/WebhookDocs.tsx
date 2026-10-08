import { useState } from 'react';
import { copyToClipboard } from '@/lib/clipboard';

/*
 * Reference for whoever builds the receiving endpoint. Everything here mirrors
 * the server: models.WebhookPayload / models.Message for the body and
 * internal/webhook for headers, signing and retries. Update both together.
 */

type ExampleEvent = 'message.received' | 'message.sent' | 'message.failed';

const EXAMPLE_PAYLOADS: Record<ExampleEvent, object> = {
  'message.received': {
    id: '6f1d9a3e-2b7c-4c55-9e0a-1d2f3b4c5d6e',
    event: 'message.received',
    created_at: '2026-10-02T16:01:23.512874Z',
    data: {
      id: '9918b2a1-59e3-4847-a9a7-e6d02bd32d7b',
      direction: 'inbound',
      phone_number: '+15551234567',
      body: 'Is the server back up?',
      status: 'received',
      created_at: '2026-10-02T16:01:23Z',
      updated_at: '2026-10-02T16:01:23Z',
    },
  },
  'message.sent': {
    id: '0b8e7c6d-5a4f-4e3d-8c2b-1a0f9e8d7c6b',
    event: 'message.sent',
    created_at: '2026-10-02T16:05:41.203117Z',
    data: {
      id: '3c2d1e0f-9a8b-4c7d-8e6f-5a4b3c2d1e0f',
      direction: 'outbound',
      phone_number: '+15557654321',
      body: 'Backup finished OK',
      status: 'sent',
      api_key_id: 'b5a4c3d2-e1f0-4a9b-8c7d-6e5f4a3b2c1d',
      created_at: '2026-10-02T16:05:39Z',
      updated_at: '2026-10-02T16:05:41Z',
    },
  },
  'message.failed': {
    id: '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d',
    event: 'message.failed',
    created_at: '2026-10-02T16:07:12.884502Z',
    data: {
      id: '1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
      direction: 'outbound',
      phone_number: '+15557654321',
      body: 'Disk usage above 90%',
      status: 'failed',
      error_message: 'waiting for SMS prompt: AT command error (expected prompt): +CMS ERROR: 330',
      created_at: '2026-10-02T16:07:07Z',
      updated_at: '2026-10-02T16:07:12Z',
    },
  },
};

const HEADERS: [string, string][] = [
  ['Content-Type', 'application/json'],
  ['User-Agent', 'sms-gateway-webhook'],
  [
    'X-Webhook-Id',
    'Event id, same as "id" in the body. Retries reuse it: use it to skip duplicates.',
  ],
  ['X-Webhook-Event', 'Event name, e.g. message.received'],
  ['X-Webhook-Timestamp', 'Unix time in seconds when this attempt was signed'],
  [
    'X-Webhook-Signature',
    'sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" keyed with the signing secret>',
  ],
];

const FIELDS: [string, string][] = [
  ['id', 'Event id (UUID). Identical on every retry of the same event.'],
  ['event', 'message.received, message.sent or message.failed'],
  ['created_at', 'When the event was emitted (RFC 3339, UTC)'],
  ['data.id', 'Message id, usable with GET /api/v1/sms/{id}'],
  ['data.direction', 'inbound for message.received, outbound for sent / failed'],
  ['data.phone_number', 'Sender for inbound messages, recipient for outbound ones'],
  ['data.body', 'Message text'],
  ['data.status', 'received, sent or failed'],
  ['data.api_key_id', 'Only present when the SMS was sent with an API key'],
  ['data.error_message', 'Only present on message.failed: why the modem rejected it'],
  ['data.created_at / data.updated_at', 'Message timestamps (RFC 3339, UTC)'],
];

const VERIFY_SNIPPETS = {
  'Node.js': `import crypto from 'node:crypto';
import express from 'express';

const app = express();
const SECRET = process.env.SMS_GATEWAY_WEBHOOK_SECRET;

// Keep the raw body: the signature covers the exact bytes that were sent.
app.post('/sms-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = req.get('X-Webhook-Timestamp') ?? '';
  const signature = req.get('X-Webhook-Signature') ?? '';
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', SECRET).update(\`\${timestamp}.\${req.body}\`).digest('hex');

  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300;
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!fresh || !valid) return res.sendStatus(401);

  const event = JSON.parse(req.body);
  // event.id is the same on every retry: skip it if you already handled it.
  console.log(event.event, event.data.phone_number, event.data.body);
  res.sendStatus(204);
});

app.listen(3000);`,
  Python: `import hashlib
import hmac
import os
import time

from flask import Flask, abort, request

app = Flask(__name__)
SECRET = os.environ["SMS_GATEWAY_WEBHOOK_SECRET"].encode()


@app.post("/sms-webhook")
def sms_webhook():
    timestamp = request.headers.get("X-Webhook-Timestamp", "")
    signature = request.headers.get("X-Webhook-Signature", "")
    body = request.get_data()  # raw bytes: the signature covers them exactly

    expected = "sha256=" + hmac.new(
        SECRET, f"{timestamp}.".encode() + body, hashlib.sha256
    ).hexdigest()
    fresh = timestamp.isdigit() and abs(time.time() - int(timestamp)) <= 300
    if not fresh or not hmac.compare_digest(signature, expected):
        abort(401)

    event = request.get_json()
    # event["id"] is the same on every retry: skip it if you already handled it.
    print(event["event"], event["data"]["phone_number"], event["data"]["body"])
    return "", 204`,
} as const;

type SnippetLanguage = keyof typeof VERIFY_SNIPPETS;

const sectionTitleClass = 'text-base font-semibold text-fg';
const textClass = 'text-sm text-fg-muted';
const inlineCodeClass =
  'rounded bg-surface-muted px-1 py-0.5 font-mono text-xs break-words text-fg';

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy is a convenience; the code stays selectable on failure.
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-3 py-1.5">
        <span className="truncate text-xs font-medium text-fg-subtle">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-xs font-medium text-primary hover:text-primary-hover"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-code p-4 text-xs leading-relaxed text-code-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={`rounded-md px-3 py-1 font-mono text-xs transition-colors ${
            option === value
              ? 'bg-primary text-primary-fg'
              : 'bg-surface-muted text-fg-muted hover:bg-surface-hover hover:text-fg'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * Name/description pairs as a definition list: side by side from sm up,
 * stacked on phones so nothing needs horizontal scrolling.
 */
function ReferenceList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-border rounded-lg border border-border">
      {rows.map(([name, description]) => (
        <div
          key={name}
          className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-4"
        >
          <dt className="font-mono text-xs break-all text-fg sm:pt-0.5">{name}</dt>
          <dd className="text-sm text-fg-muted">{description}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Explains what a webhook delivery looks like to the server receiving it. */
export default function WebhookDocs({ id }: { id?: string }) {
  const [exampleEvent, setExampleEvent] = useState<ExampleEvent>('message.received');
  const [language, setLanguage] = useState<SnippetLanguage>('Node.js');

  return (
    <section
      id={id}
      className="scroll-mt-6 space-y-6 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-fg">What your server receives</h2>
        <p className={`mt-1 ${textClass}`}>
          For every subscribed event the gateway sends an HTTP{' '}
          <code className={inlineCodeClass}>POST</code> to the Delivery URL with a JSON body.
          Respond with any <code className={inlineCodeClass}>2xx</code> status within 10 seconds;
          the response body is ignored.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className={sectionTitleClass}>Headers</h3>
        <ReferenceList rows={HEADERS} />
      </div>

      <div className="space-y-3">
        <h3 className={sectionTitleClass}>Body</h3>
        <Tabs
          label="Example event"
          options={Object.keys(EXAMPLE_PAYLOADS) as ExampleEvent[]}
          value={exampleEvent}
          onChange={setExampleEvent}
        />
        <CodeBlock
          label={`${exampleEvent} example`}
          code={JSON.stringify(EXAMPLE_PAYLOADS[exampleEvent], null, 2)}
        />
        <ReferenceList rows={FIELDS} />
      </div>

      <div className="space-y-3">
        <h3 className={sectionTitleClass}>Verifying the signature</h3>
        <ol className={`list-decimal space-y-1 pl-5 ${textClass}`}>
          <li>
            Read the raw request body before parsing it. Re-serialized JSON will not match the
            signature.
          </li>
          <li>
            Compute{' '}
            <code className={inlineCodeClass}>HMAC-SHA256(secret, timestamp + "." + body)</code> as
            lowercase hex and prefix it with <code className={inlineCodeClass}>sha256=</code>.
          </li>
          <li>
            Compare it with <code className={inlineCodeClass}>X-Webhook-Signature</code> using a
            constant-time comparison.
          </li>
          <li>Reject timestamps more than 5 minutes old to block replayed requests.</li>
        </ol>
        <Tabs
          label="Example language"
          options={Object.keys(VERIFY_SNIPPETS) as SnippetLanguage[]}
          value={language}
          onChange={setLanguage}
        />
        <CodeBlock label={`${language} receiver`} code={VERIFY_SNIPPETS[language]} />
      </div>

      <div className="space-y-3">
        <h3 className={sectionTitleClass}>Delivery and retries</h3>
        <ul className={`list-disc space-y-1 pl-5 ${textClass}`}>
          <li>
            A non-2xx response, a timeout, a connection error or a redirect (redirects are never
            followed) counts as a failure.
          </li>
          <li>
            Failed deliveries are retried after 5 seconds, 30 seconds and 2 minutes, for at most 4
            attempts. Each attempt is signed again with a fresh timestamp.
          </li>
          <li>
            Retries are kept in memory: anything still pending when the gateway restarts is dropped.
            Use <code className={inlineCodeClass}>GET /api/v1/sms/inbox</code> to reconcile after an
            outage on your side.
          </li>
          <li>Paused webhooks receive nothing until they are resumed.</li>
        </ul>
      </div>
    </section>
  );
}
