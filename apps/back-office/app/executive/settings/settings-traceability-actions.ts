'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveExecutiveCompanyId } from './lib/executive-md-settings-db';
import type { SettingsSectionId } from './settings-section-types';
import { SETTINGS_SECTION_AUDIT_ACTIONS } from './settings-section-types';

export type SettingsSectionAudit = {
  actorLabel: string;
  editedAt: string | null;
};

const RANK_PORTAL_LABELS: Record<string, string> = {
  MD: 'Executive',
  OD: 'Executive',
  FM: 'FM',
  HR: 'HR',
  OM: 'OM',
};

function formatAuditTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEmailActor(email: string): string {
  const local = email.split('@')[0]?.replace(/[._]/g, ' ').trim();
  if (!local) return email;
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function resolveActorLabel(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  actorEmail: string,
): Promise<string> {
  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, rank')
    .ilike('email', actorEmail)
    .maybeSingle();

  if (employee?.full_name) {
    const rank = typeof employee.rank === 'string' ? employee.rank.toUpperCase() : '';
    const portal = RANK_PORTAL_LABELS[rank] ?? (rank || 'Staff');
    return `${employee.full_name} (${portal})`;
  }

  return formatEmailActor(actorEmail);
}

export async function getSettingsAuditTrail(): Promise<
  Partial<Record<SettingsSectionId, SettingsSectionAudit>>
> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId();

  const actionTypes = [
    ...new Set(Object.values(SETTINGS_SECTION_AUDIT_ACTIONS).flat()),
  ];

  const { data, error } = await supabase
    .from('executive_audit_logs')
    .select('actor_email, action_type, created_at')
    .eq('company_id', companyId)
    .in('action_type', actionTypes)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('getSettingsAuditTrail:', error.message);
    return {};
  }

  const rows = data ?? [];
  const actorCache = new Map<string, string>();
  const result: Partial<Record<SettingsSectionId, SettingsSectionAudit>> = {};

  for (const [sectionId, types] of Object.entries(SETTINGS_SECTION_AUDIT_ACTIONS) as [
    SettingsSectionId,
    string[],
  ][]) {
    const match = rows.find((row) => types.includes(String(row.action_type)));
    if (!match?.created_at) continue;

    const email = String(match.actor_email ?? '');
    let actorLabel = 'System';
    if (email) {
      if (!actorCache.has(email)) {
        actorCache.set(email, await resolveActorLabel(supabase, email));
      }
      actorLabel = actorCache.get(email) ?? formatEmailActor(email);
    }

    result[sectionId] = {
      actorLabel,
      editedAt: formatAuditTimestamp(String(match.created_at)),
    };
  }

  return result;
}
