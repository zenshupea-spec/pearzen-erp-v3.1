import crypto from 'crypto';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { inferProductCodeFromInquiry } from './forge-commerce-inbox';

export const DEFAULT_FORGE_CONTACT_INBOX = 'info@pearzen.tech';
export const DEFAULT_FORGE_CONTACT_FORWARD_TO = 'zenshupea@gmail.com';

export type ForgeContactThread = {
  id: string;
  visitorEmail: string;
  visitorName: string | null;
  subject: string;
  status: 'open' | 'archived';
  suggestedProductCode: string | null;
  lastMessageAt: string;
  createdAt: string;
};

export type ForgeContactMessage = {
  id: string;
  threadId: string;
  direction: 'inbound' | 'outbound';
  fromEmail: string;
  toEmails: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  operatorEmail: string | null;
  createdAt: string;
};

type ResendReceivedEmail = {
  id?: string;
  from?: string;
  to?: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  message_id?: string;
  headers?: Record<string, string | string[]>;
};

type ResendWebhookEvent = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    /** Actual inbound recipient when Resend routes via Received-for headers. */
    received_for?: string[];
    subject?: string;
    message_id?: string;
  };
};

function forgeContactInboxAddress(): string {
  return (
    process.env.FORGE_CONTACT_INBOX?.trim().toLowerCase() ?? DEFAULT_FORGE_CONTACT_INBOX
  );
}

function forgeContactForwardTo(): string {
  return (
    process.env.FORGE_CONTACT_FORWARD_TO?.trim().toLowerCase() ??
    DEFAULT_FORGE_CONTACT_FORWARD_TO
  );
}

export function forgeContactFromAddress(): string {
  return process.env.FORGE_CONTACT_FROM?.trim() ?? 'Pearzen <info@pearzen.tech>';
}

function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() ?? null;
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] ?? trimmed).trim().toLowerCase();
}

function parseDisplayName(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)\s*<[^>]+>$/);
  if (!match) return null;
  const name = match[1].trim().replace(/^["']|["']$/g, '');
  return name || null;
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^(re|fwd):\s*/gi, '').trim().toLowerCase();
}

function headerValue(
  headers: Record<string, string | string[]> | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return null;
  const value = headers[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function parseMessageIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const matches = value.match(/<[^>]+>/g);
  if (matches?.length) return matches;
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function addressesInbox(...recipientLists: (string[] | undefined)[]): boolean {
  const inbox = forgeContactInboxAddress();
  return recipientLists.some((list) =>
    (list ?? []).some((addr) => normalizeEmail(addr) === inbox),
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyResendWebhook(payload: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return false;

  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  return signatureHeader
    .split(' ')
    .some((part) => {
      const [, value] = part.split(',');
      return value ? timingSafeEqual(value, expected) : false;
    });
}

async function resendFetch(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = resendApiKey();
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');

  return fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function fetchReceivedEmail(emailId: string): Promise<ResendReceivedEmail | null> {
  const response = await resendFetch(`/emails/receiving/${emailId}`);
  if (!response.ok) {
    console.error('forge-contact-inbox fetchReceivedEmail:', emailId, await response.text());
    return null;
  }
  return (await response.json()) as ResendReceivedEmail;
}

async function sendResendEmail(input: {
  from: string;
  to: string[];
  subject: string;
  text: string;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string; resendEmailId?: string }> {
  const response = await resendFetch('/emails', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return { ok: false, error: (await response.text()) || `Resend ${response.status}` };
  }

  const json = (await response.json()) as { id?: string };
  return { ok: true, resendEmailId: json.id };
}

async function findThreadByMessageIds(messageIds: string[]): Promise<string | null> {
  if (messageIds.length === 0) return null;
  const db = createSupabaseServiceClient();
  const { data } = await db
    .from('forge_contact_messages')
    .select('thread_id')
    .in('message_id', messageIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.thread_id ? String(data.thread_id) : null;
}

async function findThreadByVisitorAndSubject(
  visitorEmail: string,
  subject: string,
): Promise<string | null> {
  const db = createSupabaseServiceClient();
  const normalized = normalizeSubject(subject);
  const { data } = await db
    .from('forge_contact_threads')
    .select('id, subject')
    .eq('visitor_email', visitorEmail)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false })
    .limit(20);

  const hit = (data ?? []).find(
    (row) => normalizeSubject(String(row.subject ?? '')) === normalized,
  );
  return hit?.id ? String(hit.id) : null;
}

async function createThread(input: {
  visitorEmail: string;
  visitorName: string | null;
  subject: string;
}): Promise<string> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('forge_contact_threads')
    .insert({
      visitor_email: input.visitorEmail,
      visitor_name: input.visitorName,
      subject: input.subject,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Could not create contact thread.');
  }
  return String(data.id);
}

async function resolveThreadId(input: {
  fromEmail: string;
  fromDisplay: string;
  subject: string;
  inReplyTo: string | null;
  references: string | null;
}): Promise<string> {
  const replyIds = [
    ...parseMessageIds(input.inReplyTo),
    ...parseMessageIds(input.references),
  ];
  const byMessage = await findThreadByMessageIds(replyIds);
  if (byMessage) return byMessage;

  const bySubject = await findThreadByVisitorAndSubject(input.fromEmail, input.subject);
  if (bySubject) return bySubject;

  return createThread({
    visitorEmail: input.fromEmail,
    visitorName: parseDisplayName(input.fromDisplay),
    subject: input.subject.replace(/^(re|fwd):\s*/i, '').trim() || input.subject,
  });
}

async function forwardInboundCopyToGmail(input: {
  fromDisplay: string;
  fromEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
}): Promise<void> {
  const forwardTo = forgeContactForwardTo();
  const text =
    input.bodyText?.trim() ||
    (input.bodyHtml ? input.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '') ||
    '(No message body)';

  const body = [
    `New message to ${forgeContactInboxAddress()}`,
    '',
    `From: ${input.fromDisplay}`,
    `Subject: ${input.subject}`,
    '',
    text,
    '',
    '—',
    'Reply from SaaS Forge → Contact Inbox to respond as info@pearzen.tech',
  ].join('\n');

  const result = await sendResendEmail({
    from: forgeContactFromAddress(),
    to: [forwardTo],
    subject: `[Pearzen inbox] ${input.subject}`,
    text: body,
  });

  if (!result.ok) {
    console.error('forge-contact-inbox forward copy:', forwardTo, result.error);
    throw new Error(result.error ?? 'Could not forward inbox copy to operator Gmail.');
  }
}

export async function processResendInboundWebhook(
  event: ResendWebhookEvent,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (event.type !== 'email.received' || !event.data?.email_id) {
    return { ok: true, skipped: true };
  }

  if (!addressesInbox(event.data.to, event.data.received_for)) {
    return { ok: true, skipped: true };
  }

  const db = createSupabaseServiceClient();
  const { data: existing } = await db
    .from('forge_contact_messages')
    .select('id')
    .eq('resend_email_id', event.data.email_id)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, skipped: true };
  }

  const received = await fetchReceivedEmail(event.data.email_id);
  if (!received) {
    return { ok: false, error: 'Could not load received email content.' };
  }

  if (!addressesInbox(event.data.to, event.data.received_for, received.to)) {
    return { ok: true, skipped: true };
  }

  const fromDisplay = headerValue(received.headers, 'from') ?? received.from ?? event.data.from ?? '';
  const fromEmail = normalizeEmail(fromDisplay || event.data.from || '');
  if (!fromEmail) {
    return { ok: false, error: 'Inbound email is missing a sender address.' };
  }

  const subject = received.subject ?? event.data.subject ?? '(No subject)';
  const inReplyTo = headerValue(received.headers, 'in-reply-to');
  const references = headerValue(received.headers, 'references');
  const messageId =
    received.message_id ?? event.data.message_id ?? headerValue(received.headers, 'message-id');

  const threadId = await resolveThreadId({
    fromEmail,
    fromDisplay,
    subject,
    inReplyTo,
    references,
  });

  const { error: insertError } = await db.from('forge_contact_messages').insert({
    thread_id: threadId,
    direction: 'inbound',
    from_email: fromEmail,
    to_emails: received.to ?? event.data.to ?? [forgeContactInboxAddress()],
    subject,
    body_text: received.text ?? null,
    body_html: received.html ?? null,
    message_id: messageId,
    in_reply_to: inReplyTo,
    resend_email_id: event.data.email_id,
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  const suggestedProductCode = inferProductCodeFromInquiry(subject, received.text ?? null);

  await db
    .from('forge_contact_threads')
    .update({
      last_message_at: new Date().toISOString(),
      ...(suggestedProductCode ? { suggested_product_code: suggestedProductCode } : {}),
    })
    .eq('id', threadId);

  await forwardInboundCopyToGmail({
    fromDisplay,
    fromEmail,
    subject,
    bodyText: received.text ?? null,
    bodyHtml: received.html ?? null,
  });

  return { ok: true };
}

function mapThread(row: Record<string, unknown>): ForgeContactThread {
  return {
    id: String(row.id),
    visitorEmail: String(row.visitor_email),
    visitorName: row.visitor_name ? String(row.visitor_name) : null,
    subject: String(row.subject),
    status: row.status === 'archived' ? 'archived' : 'open',
    suggestedProductCode: row.suggested_product_code
      ? String(row.suggested_product_code)
      : null,
    lastMessageAt: String(row.last_message_at),
    createdAt: String(row.created_at),
  };
}

function mapMessage(row: Record<string, unknown>): ForgeContactMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
    fromEmail: String(row.from_email),
    toEmails: Array.isArray(row.to_emails) ? row.to_emails.map(String) : [],
    subject: String(row.subject),
    bodyText: row.body_text ? String(row.body_text) : null,
    bodyHtml: row.body_html ? String(row.body_html) : null,
    messageId: row.message_id ? String(row.message_id) : null,
    inReplyTo: row.in_reply_to ? String(row.in_reply_to) : null,
    operatorEmail: row.operator_email ? String(row.operator_email) : null,
    createdAt: String(row.created_at),
  };
}

export async function listForgeContactThreads(): Promise<ForgeContactThread[]> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('forge_contact_threads')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('listForgeContactThreads:', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapThread(row as Record<string, unknown>));
}

export async function getForgeContactThread(
  threadId: string,
): Promise<{ thread: ForgeContactThread; messages: ForgeContactMessage[] } | null> {
  const db = createSupabaseServiceClient();
  const { data: thread, error: threadError } = await db
    .from('forge_contact_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();

  if (threadError || !thread) return null;

  const { data: messages, error: messagesError } = await db
    .from('forge_contact_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('getForgeContactThread messages:', messagesError.message);
    return null;
  }

  return {
    thread: mapThread(thread as Record<string, unknown>),
    messages: (messages ?? []).map((row) => mapMessage(row as Record<string, unknown>)),
  };
}

export async function sendForgeContactReply(input: {
  threadId: string;
  body: string;
  operatorEmail: string;
}): Promise<{ ok: boolean; error?: string }> {
  const trimmed = input.body.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a reply message.' };
  }

  if (!resendApiKey()) {
    return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  }

  const threadData = await getForgeContactThread(input.threadId);
  if (!threadData) {
    return { ok: false, error: 'Conversation not found.' };
  }

  const { thread, messages } = threadData;
  const lastInbound = [...messages].reverse().find((msg) => msg.direction === 'inbound');
  const replySubject = thread.subject.match(/^re:/i) ? thread.subject : `Re: ${thread.subject}`;

  const headers: Record<string, string> = {};
  if (lastInbound?.messageId) {
    headers['In-Reply-To'] = lastInbound.messageId;
    const referenceIds = messages
      .map((msg) => msg.messageId)
      .filter((id): id is string => Boolean(id));
    headers.References = referenceIds.join(' ');
  }

  const sendResult = await sendResendEmail({
    from: forgeContactFromAddress(),
    to: [thread.visitorEmail],
    subject: replySubject,
    text: trimmed,
    headers: Object.keys(headers).length ? headers : undefined,
  });

  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error };
  }

  const db = createSupabaseServiceClient();
  const { error } = await db.from('forge_contact_messages').insert({
    thread_id: thread.id,
    direction: 'outbound',
    from_email: normalizeEmail(forgeContactFromAddress()),
    to_emails: [thread.visitorEmail],
    subject: replySubject,
    body_text: trimmed,
    resend_email_id: sendResult.resendEmailId ?? null,
    operator_email: input.operatorEmail,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  await db
    .from('forge_contact_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', thread.id);

  return { ok: true };
}
