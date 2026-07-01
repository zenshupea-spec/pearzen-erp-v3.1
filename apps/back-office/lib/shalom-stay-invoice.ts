/** Shalom caretaker stay invoice — HTML/text body and reference allocation. */

import { formatShalomCollectLkr } from './shalom-calendar';
import {
  portalResendNotConfiguredError,
  resolveResendApiKey,
  shalomStayInvoiceEmailFrom,
} from './portal-resend';

export const SHALOM_INVOICE_REF_PREFIX = 'SHL';
export const SHALOM_RESIDENCE_BRAND = 'Shalom Residence';

export type ShalomStayInvoiceBuildInput = {
  reference: string;
  issuedAt: string;
  propertyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  collectLkr: number | null;
  totalLkr: number;
};

export function allocateShalomInvoiceReference(
  existing: string | null | undefined,
  now: Date = new Date(),
): string {
  const trimmed = existing?.trim();
  if (trimmed) return trimmed;
  const year = now.getUTCFullYear();
  const suffix = String(Math.floor(Math.random() * 99_999) + 1).padStart(5, '0');
  return `${SHALOM_INVOICE_REF_PREFIX}-${year}-${suffix}`;
}

export function formatShalomInvoiceDate(isoDate: string): string {
  const normalized = isoDate.trim();
  if (!normalized) return '—';
  const parsed = new Date(normalized.includes('T') ? normalized : `${normalized}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShalomInvoiceLkr(amount: number): string {
  return formatShalomCollectLkr(Math.round(amount));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLineRows(input: ShalomStayInvoiceBuildInput): Array<{
  label: string;
  amountLkr: number;
}> {
  if (input.collectLkr != null && input.collectLkr > 0) {
    const nightLabel =
      input.nights === 1 ? '1 night stay' : `${input.nights} nights stay`;
    return [{ label: nightLabel, amountLkr: input.collectLkr }];
  }
  return [];
}

function stayLineLabel(nights: number): string {
  return nights === 1 ? '1 night' : `${nights} nights`;
}

export function buildShalomStayInvoiceContent(input: ShalomStayInvoiceBuildInput): {
  html: string;
  text: string;
  totalLkr: number;
} {
  const lineRows = buildLineRows(input);
  const totalLkr = input.totalLkr;
  const issuedLabel = formatShalomInvoiceDate(input.issuedAt);

  const textLines = [
    `${SHALOM_RESIDENCE_BRAND} — ${input.reference}`,
    '',
    `Guest: ${input.guestName}`,
    `Property: ${input.propertyName}`,
    `Stay: ${stayLineLabel(input.nights)} (${formatShalomInvoiceDate(input.checkIn)} → ${formatShalomInvoiceDate(input.checkOut)})`,
    `Issued: ${issuedLabel}`,
    '',
    ...(lineRows.length > 0
      ? [
          'Charges:',
          ...lineRows.map((row) => `- ${row.label}: ${formatShalomInvoiceLkr(row.amountLkr)}`),
          '',
          `Total: ${formatShalomInvoiceLkr(totalLkr)}`,
        ]
      : ['No stay amount recorded on this booking.']),
    '',
    `Thank you for staying with ${SHALOM_RESIDENCE_BRAND}.`,
  ];

  const lineItemsHtml = lineRows.length
    ? lineRows
        .map(
          (row) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.label)}</td>` +
            `<td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatShalomInvoiceLkr(row.amountLkr))}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="2" style="padding:8px 0;color:#6b7280;">No stay amount recorded</td></tr>`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Stay invoice</p>
    <h1 style="margin:0 0 8px;font-size:24px;">${escapeHtml(SHALOM_RESIDENCE_BRAND)}</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">Reference ${escapeHtml(input.reference)} · Issued ${escapeHtml(issuedLabel)}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
      <tr><td style="padding:4px 0;color:#6b7280;width:120px;">Guest</td><td style="padding:4px 0;">${escapeHtml(input.guestName)}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;">Property</td><td style="padding:4px 0;">${escapeHtml(input.propertyName)}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;">Stay</td><td style="padding:4px 0;">${escapeHtml(stayLineLabel(input.nights))} · ${escapeHtml(formatShalomInvoiceDate(input.checkIn))} → ${escapeHtml(formatShalomInvoiceDate(input.checkOut))}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #111827;">Description</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid #111827;">Amount</th>
        </tr>
      </thead>
      <tbody>${lineItemsHtml}</tbody>
      <tfoot>
        <tr>
          <td style="padding:12px 0 0;font-weight:700;">Total</td>
          <td style="padding:12px 0 0;text-align:right;font-weight:700;">${escapeHtml(formatShalomInvoiceLkr(totalLkr))}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280;">Thank you for staying with ${escapeHtml(SHALOM_RESIDENCE_BRAND)}.</p>
  </div>
</body>
</html>`;

  return { html, text: textLines.join('\n'), totalLkr };
}

export function buildShalomStayInvoiceFromBooking(input: {
  reference: string;
  issuedAt?: string;
  propertyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  collectLkr: number | null;
}): { html: string; text: string; totalLkr: number; reference: string } {
  const totalLkr =
    input.collectLkr != null && input.collectLkr > 0 ? Math.round(input.collectLkr) : 0;
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const content = buildShalomStayInvoiceContent({
    reference: input.reference,
    issuedAt,
    propertyName: input.propertyName,
    guestName: input.guestName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: input.nights,
    collectLkr: input.collectLkr,
    totalLkr,
  });
  return { ...content, reference: input.reference };
}

const GUEST_INVOICE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidShalomGuestInvoiceEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return GUEST_INVOICE_EMAIL_PATTERN.test(trimmed);
}

export const SHALOM_STAY_INVOICE_EMAIL_FROM_DEFAULT =
  'Shalom Residence <support@pearzen.tech>';

export { shalomStayInvoiceEmailFrom } from './portal-resend';

export async function sendShalomStayInvoiceEmail(input: {
  to: string;
  reference: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; emailed: boolean; error?: string; resendMessageId?: string }> {
  const to = input.to.trim();
  if (!to) {
    return { ok: false, emailed: false, error: 'Recipient email is required.' };
  }

  const apiKey = resolveResendApiKey();
  if (!apiKey) {
    return {
      ok: false,
      emailed: false,
      error: portalResendNotConfiguredError(),
    };
  }

  const from = shalomStayInvoiceEmailFrom();
  const subject = `${SHALOM_RESIDENCE_BRAND} — stay invoice ${input.reference}`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      let detail = await response.text();
      try {
        const parsed = JSON.parse(detail) as { message?: string };
        if (parsed.message) detail = parsed.message;
      } catch {
        /* keep raw detail */
      }
      return {
        ok: false,
        emailed: false,
        error: detail || `Email API returned ${response.status}.`,
      };
    }

    const json = (await response.json()) as { id?: string };
    return { ok: true, emailed: true, resendMessageId: json.id };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}
