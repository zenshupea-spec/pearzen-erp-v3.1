import 'server-only';

import { resolveShalomBookingsAlertEmail } from './shalom-direct-booking-alert';
import {
  buildShalomContactInquiryEmailContent,
  parseShalomContactInquiryPayload,
  validateShalomContactInquiry,
  type ShalomContactInquiryActionResult,
} from './shalom-public-contact';
import {
  portalResendNotConfiguredError,
  resolveResendApiKey,
  shalomStayInvoiceEmailFrom,
} from './portal-resend';

export async function submitShalomContactInquiryFromPayload(
  payload: unknown,
): Promise<ShalomContactInquiryActionResult> {
  const parsed = parseShalomContactInquiryPayload(payload);
  if (!parsed) {
    return { ok: false, error: 'Invalid enquiry. Please refresh and try again.' };
  }

  const validation = validateShalomContactInquiry(parsed);
  if (!validation.ok) {
    return { ok: false, fieldErrors: validation.fieldErrors };
  }

  const apiKey = resolveResendApiKey();
  if (!apiKey) {
    return { ok: false, error: portalResendNotConfiguredError() };
  }

  const recipient = resolveShalomBookingsAlertEmail();
  const { subject, text, html } = buildShalomContactInquiryEmailContent(validation.normalized);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: shalomStayInvoiceEmailFrom(),
        to: [recipient],
        reply_to: validation.normalized.email,
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('submitShalomContactInquiryFromPayload:', response.status, body);
      return {
        ok: false,
        error: 'We could not send your message right now. Please try again or call us directly.',
      };
    }

    return { ok: true };
  } catch (error) {
    console.error('submitShalomContactInquiryFromPayload:', error);
    return {
      ok: false,
      error: 'We could not send your message right now. Please try again or call us directly.',
    };
  }
}
