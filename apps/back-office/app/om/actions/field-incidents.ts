'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import {
  isOmSectorScopeEmpty,
  omSectorOwnsGuardEpf,
  omSectorOwnsSmKey,
  resolveOmSectorScopeForSession,
} from '../../../lib/om-sector-scope';
import { isExecutiveRank, normalizePortalRole } from '../../../lib/portal-role-utils';
import { normalizeSmEpf } from '../../../../../packages/supabase/sm-epf';

export type FieldIncidentAckRole = 'OM' | 'SM' | 'MD';

const REVALIDATE_PATHS = ['/om', '/executive/operations'] as const;

function ackColumn(role: FieldIncidentAckRole): 'ack_om' | 'ack_sm' | 'ack_md' {
  if (role === 'OM') return 'ack_om';
  if (role === 'SM') return 'ack_sm';
  return 'ack_md';
}

function incidentAckRoleFromRank(rank: string | null): FieldIncidentAckRole | null {
  const normalized = normalizePortalRole(rank);
  if (!normalized) return null;
  if (normalized === 'SM') return 'SM';
  if (normalized === 'OM') return 'OM';
  if (isExecutiveRank(normalized)) return 'MD';
  return null;
}

/** Resolve tri-role ack leg for the signed-in back-office session. */
export async function resolveSessionFieldIncidentAckRole(): Promise<FieldIncidentAckRole | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const profile = await fetchBackOfficeUserProfile(supabase, user);
    return incidentAckRoleFromRank(profile.role);
  } catch {
    return null;
  }
}

async function assertSessionCanAckAs(role: FieldIncidentAckRole): Promise<void> {
  const sessionRole = await resolveSessionFieldIncidentAckRole();
  if (!sessionRole) {
    throw new Error('You must be signed in to acknowledge incidents.');
  }
  if (sessionRole !== role) {
    throw new Error(`Your session cannot acknowledge as ${role}.`);
  }
}

async function assertOmCanAckSmIncident(
  supabase: SupabaseClient,
  incidentId: string,
): Promise<void> {
  const scope = await resolveOmSectorScopeForSession();
  if (scope === null) return;
  if (isOmSectorScopeEmpty(scope)) {
    throw new Error('No assigned sectors — cannot acknowledge incidents.');
  }

  const { data, error } = await supabase
    .from('sm_incident_reports')
    .select('sm_epf')
    .eq('id', incidentId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Incident not found.');
  }

  const smEpf = normalizeSmEpf(data.sm_epf) ?? String(data.sm_epf ?? '');
  if (!omSectorOwnsSmKey(scope, smEpf)) {
    throw new Error('This incident is outside your assigned sectors.');
  }
}

async function assertOmCanAckGuardVoiceIncident(
  supabase: SupabaseClient,
  incidentId: string,
): Promise<void> {
  const scope = await resolveOmSectorScopeForSession();
  if (scope === null) return;
  if (isOmSectorScopeEmpty(scope)) {
    throw new Error('No assigned sectors — cannot acknowledge incidents.');
  }

  const { data, error } = await supabase
    .from('incidents')
    .select('emp_number')
    .eq('id', incidentId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Incident not found.');
  }

  const guardEpf = String(data.emp_number ?? '').trim().toUpperCase();
  if (!guardEpf || !omSectorOwnsGuardEpf(scope, guardEpf)) {
    throw new Error('This guard report is outside your assigned sectors.');
  }
}

/** Persist tri-role acknowledgement on SM incident reports (tenant RLS). */
export async function acknowledgeSmFieldIncident(
  incidentId: string,
  role: FieldIncidentAckRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertSessionCanAckAs(role);

    const supabase = await createSupabaseServerClient();
    if (role === 'OM') {
      await assertOmCanAckSmIncident(supabase, incidentId);
    }

    const { error } = await supabase
      .from('sm_incident_reports')
      .update({ [ackColumn(role)]: true })
      .eq('id', incidentId);

    if (error) throw new Error(error.message);

    for (const path of REVALIDATE_PATHS) {
      revalidatePath(path);
    }

    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to acknowledge incident';
    return { success: false, error: message };
  }
}

/** Mark guard voice incidents as reviewed by operations (status column). */
export async function acknowledgeGuardVoiceIncident(
  incidentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRole = await resolveSessionFieldIncidentAckRole();
    if (sessionRole === 'OM') {
      await assertOmCanAckGuardVoiceIncident(supabase, incidentId);
    }

    const { error } = await supabase
      .from('incidents')
      .update({ status: 'ACKNOWLEDGED' })
      .eq('id', incidentId);

    if (error) throw new Error(error.message);

    for (const path of REVALIDATE_PATHS) {
      revalidatePath(path);
    }

    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to acknowledge guard report';
    return { success: false, error: message };
  }
}
