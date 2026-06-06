/** Platform-operator access for SaaS Forge (tenant billing, MD provisioning, kill-switch). */

import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export const DEFAULT_FORGE_OPERATOR_EMAILS = [
  'zenshupea@gmail.com',
  'shauvvvv@gmail.com',
] as const;

function parseEnvForgeOperatorEmails(): string[] {
  const raw = process.env.FORGE_OPERATOR_EMAILS ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeForgeOperatorEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function isEmailInForgeAllowlist(
  email: string | null | undefined,
  allowlist: string[],
): boolean {
  if (!email || allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

export async function getForgeOperatorEmails(): Promise<string[]> {
  try {
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from('forge_settings')
      .select('operator_emails')
      .eq('singleton', true)
      .maybeSingle();

    if (!error && data?.operator_emails?.length) {
      return normalizeForgeOperatorEmails(data.operator_emails);
    }
  } catch {
    // Table may not exist until migration is applied.
  }

  const fromEnv = parseEnvForgeOperatorEmails();
  if (fromEnv.length > 0) return fromEnv;

  return [...DEFAULT_FORGE_OPERATOR_EMAILS];
}

export async function isForgeOperatorEmail(
  email: string | null | undefined,
): Promise<boolean> {
  const allowlist = await getForgeOperatorEmails();
  return isEmailInForgeAllowlist(email, allowlist);
}
