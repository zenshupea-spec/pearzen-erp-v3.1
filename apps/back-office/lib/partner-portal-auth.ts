import 'server-only';

import type { ForgeServicePartner } from './forge-partners';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapPartner(row: Record<string, unknown>): ForgeServicePartner {
  return {
    id: String(row.id),
    userId: row.user_id != null ? String(row.user_id) : null,
    displayName: String(row.display_name ?? ''),
    email: String(row.email ?? ''),
    referralCode: String(row.referral_code ?? ''),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function getPartnerForEmail(
  email: string | null | undefined,
): Promise<ForgeServicePartner | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('forge_service_partners')
    .select('*')
    .eq('email', normalized)
    .maybeSingle();

  if (error && error.code !== '42P01') return null;
  if (!data) return null;
  return mapPartner(data as Record<string, unknown>);
}

export async function getPartnerForUserId(
  userId: string | null | undefined,
): Promise<ForgeServicePartner | null> {
  if (!userId?.trim()) return null;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('forge_service_partners')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== '42P01') return null;
  if (!data) return null;
  return mapPartner(data as Record<string, unknown>);
}

export async function ensurePartnerUserLink(
  email: string,
  userId: string,
): Promise<ForgeServicePartner | null> {
  const partner = await getPartnerForEmail(email);
  if (!partner || !partner.isActive) return null;

  if (partner.userId && partner.userId !== userId) {
    return null;
  }

  if (!partner.userId) {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from('forge_service_partners')
      .update({
        user_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partner.id);

    if (error) return null;
    return { ...partner, userId };
  }

  return partner;
}

export async function assertPartnerCanSignIn(
  email: string | null | undefined,
): Promise<
  | { ok: true; partner: ForgeServicePartner }
  | { ok: false; reason: 'missing_email' | 'not_provisioned' | 'inactive' }
> {
  const partner = await getPartnerForEmail(email);
  if (!email?.trim()) return { ok: false, reason: 'missing_email' };
  if (!partner) return { ok: false, reason: 'not_provisioned' };
  if (!partner.isActive) return { ok: false, reason: 'inactive' };
  return { ok: true, partner };
}

export async function resolvePartnerPortalEntryPath(
  email: string | null | undefined,
): Promise<string> {
  const gate = await assertPartnerCanSignIn(email);
  if (!gate.ok) return '/login/partners';
  return '/partners';
}

export function partnerLoginErrorCode(
  reason: 'missing_email' | 'not_provisioned' | 'inactive',
): string {
  if (reason === 'inactive') return 'partner_inactive';
  return 'partner_denied';
}

export function normalizePartnerEmail(email: string): string {
  return normalizeEmail(email);
}
