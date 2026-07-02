export const DEFAULT_SHALOM_PUBLIC_CONTACT_PHONE = '+94753632001';

export type ShalomContactInquiryInput = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

export type ShalomContactInquiryNormalized = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 120;
const PHONE_MAX = 32;
const MESSAGE_MAX = 2000;

function normalizePhone(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function phoneDigitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

export function resolveShalomPublicContactPhone(): string {
  return (
    process.env.NEXT_PUBLIC_SHALOM_PUBLIC_CONTACT_PHONE?.trim() ||
    process.env.SHALOM_PUBLIC_CONTACT_PHONE?.trim() ||
    DEFAULT_SHALOM_PUBLIC_CONTACT_PHONE
  );
}

export function formatShalomPublicContactPhoneDisplay(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('+94') && trimmed.length >= 12) {
    const local = trimmed.slice(3);
    return `+94 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`.trim();
  }
  return trimmed;
}

export function shalomPublicContactTelHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? `tel:${digits}` : `tel:+${digits.replace(/^\+/, '')}`;
}

export function validateShalomContactInquiry(
  input: ShalomContactInquiryInput,
):
  | { ok: true; normalized: ShalomContactInquiryNormalized }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) {
    fieldErrors.name = 'Please enter your name.';
  } else if (name.length < 2) {
    fieldErrors.name = 'Name must be at least 2 characters.';
  } else if (name.length > NAME_MAX) {
    fieldErrors.name = `Name must be at most ${NAME_MAX} characters.`;
  }

  const email = input.email.trim().toLowerCase();
  if (!email) {
    fieldErrors.email = 'Please enter your email address.';
  } else if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = 'Please enter a valid email address.';
  } else if (email.length > 254) {
    fieldErrors.email = 'Email address is too long.';
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    fieldErrors.phone = 'Please enter your phone number.';
  } else if (phone.length > PHONE_MAX) {
    fieldErrors.phone = 'Phone number is too long.';
  } else if (phoneDigitCount(phone) < 9) {
    fieldErrors.phone = 'Please enter a valid phone number with at least 9 digits.';
  }

  const message = input.message.trim();
  if (!message) {
    fieldErrors.message = 'Please enter a message.';
  } else if (message.length < 10) {
    fieldErrors.message = 'Message must be at least 10 characters.';
  } else if (message.length > MESSAGE_MAX) {
    fieldErrors.message = `Message must be at most ${MESSAGE_MAX} characters.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    normalized: { name, email, phone, message },
  };
}

export type ShalomContactInquiryActionResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function parseShalomContactInquiryPayload(
  payload: unknown,
): ShalomContactInquiryInput | null {
  if (!isRecord(payload)) return null;

  return {
    name: readString(payload.name),
    email: readString(payload.email),
    phone: readString(payload.phone),
    message: readString(payload.message),
  };
}

export function buildShalomContactInquiryEmailContent(input: ShalomContactInquiryNormalized): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Shalom Residence enquiry from ${input.name}`;
  const text = [
    'New contact form enquiry — Shalom Residence guest website',
    '',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone}`,
    '',
    'Message:',
    input.message,
  ].join('\n');

  const html = `
    <p><strong>New contact form enquiry</strong> — Shalom Residence guest website</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(input.name)}</li>
      <li><strong>Email:</strong> <a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></li>
      <li><strong>Phone:</strong> ${escapeHtml(input.phone)}</li>
    </ul>
    <p><strong>Message</strong></p>
    <p>${escapeHtml(input.message).replace(/\n/g, '<br />')}</p>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
