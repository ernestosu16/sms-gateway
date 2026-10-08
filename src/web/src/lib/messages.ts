export type MessageDirection = 'inbound' | 'outbound';

export interface Message {
  id: string;
  direction: MessageDirection;
  phone_number: string;
  body: string;
  status: string;
  api_key_id?: string;
  modem_response?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  phone_number: string;
  last_message: Message;
  message_count: number;
  unread_count: number;
  /** Saved contact name; absent when the number has none. */
  contact_name?: string;
}

export interface Contact {
  phone_number: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** Mirrors models.MaxContactNameRunes on the server. */
export const MAX_CONTACT_NAME = 100;

export interface SendSMSResponse {
  id: string;
  status: string;
  message?: string;
}

/**
 * Mirrors models.NormalizePhone on the server: strips the formatting people
 * type so the client looks up the same conversation the server stores.
 */
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-().]/g, '');
}

/**
 * Mirrors the server's recipient rule (modem.recipientPattern): an
 * international number with + and country code, or a 3–6 digit short code.
 * Expects a value already passed through normalizePhone.
 */
export function isDialable(phone: string): boolean {
  return /^(\+[1-9]\d{6,14}|\d{3,6})$/.test(phone);
}

export const RECIPIENT_FORMAT_HINT =
  'Use the international format with + and country code, e.g. +15551234567 (or a 3–6 digit short code).';

/** The server rejects longer bodies (modem.maxBodyRunes: 6 concatenated parts). */
export const MAX_BODY_CHARS = 918;

export function chatPath(phone: string): string {
  return `/chats/${encodeURIComponent(phone)}`;
}

const CONVERSATIONS_CHANGED_EVENT = 'sms-gateway:conversations-changed';

/**
 * Tells listeners (the conversation list, the nav unread badge) that
 * conversations changed: messages read, sent or deleted, or a contact renamed.
 */
export function notifyConversationsChanged(): void {
  window.dispatchEvent(new window.Event(CONVERSATIONS_CHANGED_EVENT));
}

export function onConversationsChanged(listener: () => void): () => void {
  window.addEventListener(CONVERSATIONS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CONVERSATIONS_CHANGED_EVENT, listener);
}

/** Orders messages oldest first with the same tiebreaker the server uses. */
export function compareMessages(a: Message, b: Message): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
