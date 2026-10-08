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
}

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

/** Mirrors the server's modem.ValidateSMS recipient rule: optional +, up to 20 digits. */
export function isDialable(phone: string): boolean {
  return /^\+?\d{1,20}$/.test(phone);
}

/** The server rejects longer bodies (modem.maxBodyRunes: 6 concatenated parts). */
export const MAX_BODY_CHARS = 918;

export function chatPath(phone: string): string {
  return `/chats/${encodeURIComponent(phone)}`;
}

const UNREAD_CHANGED_EVENT = 'sms-gateway:unread-changed';

/** Tells listeners (the nav badge) that unread counts may have changed. */
export function notifyUnreadChanged(): void {
  window.dispatchEvent(new window.Event(UNREAD_CHANGED_EVENT));
}

export function onUnreadChanged(listener: () => void): () => void {
  window.addEventListener(UNREAD_CHANGED_EVENT, listener);
  return () => window.removeEventListener(UNREAD_CHANGED_EVENT, listener);
}

/** Orders messages oldest first with the same tiebreaker the server uses. */
export function compareMessages(a: Message, b: Message): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
