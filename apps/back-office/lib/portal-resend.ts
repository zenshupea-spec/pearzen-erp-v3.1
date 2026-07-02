/** Shared Resend config for tenant portal emails (MD OTP, Shalom invoices, etc.). */

import { executivePortalOtpEmailFrom } from './executive-portal-auth-policy';

export function resolveResendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || null;
}

export function portalResendConfigured(): boolean {
  return Boolean(resolveResendApiKey());
}

/** Verified-domain From address for portal transactional mail. */
export function portalResendEmailFrom(): string {
  return executivePortalOtpEmailFrom();
}

/** Shalom stay invoices — Shalom Residence display name on the portal verified address. */
export function shalomStayInvoiceEmailFrom(): string {
  const custom = process.env.SHALOM_STAY_INVOICE_EMAIL_FROM?.trim();
  if (custom) return custom;

  const portalFrom =
    process.env.PORTAL_EMAIL_FROM?.trim() ||
    process.env.PORTAL_OTP_EMAIL_FROM?.trim() ||
    portalResendEmailFrom();

  const emailMatch = portalFrom.match(/<([^>]+)>/);
  const email = emailMatch?.[1]?.trim() || 'support@pearzen.tech';
  return `Shalom Residence <${email}>`;
}

export function portalResendNotConfiguredError(): string {
  return 'Email could not be sent from this server. Add RESEND_API_KEY to .env.seed.tmp, run npm run wire:backend, and restart npm run dev (or set both on Vercel for production).';
}
