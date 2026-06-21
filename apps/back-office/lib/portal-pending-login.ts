import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export const PENDING_LOGIN_TIMEOUT_MS = 90 * 1000;

export function decodeSupabaseAccessTokenSessionId(
  accessToken: string,
): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
    ) as { session_id?: unknown };
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

export type PendingLoginRecord = {
  id: string;
  employeeId: string | null;
  operatorEmail: string | null;
  challengerSessionId: string;
  incumbentSessionId: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
};

function mapPendingRow(data: Record<string, unknown>): PendingLoginRecord {
  return {
    id: String(data.id),
    employeeId:
      typeof data.employee_id === 'string' ? data.employee_id : null,
    operatorEmail:
      typeof data.operator_email === 'string' ? data.operator_email : null,
    challengerSessionId: String(data.challenger_session_id),
    incumbentSessionId:
      typeof data.incumbent_session_id === 'string'
        ? data.incumbent_session_id
        : null,
    status: String(data.status),
    expiresAt: String(data.expires_at),
    createdAt: String(data.created_at),
  };
}

const PENDING_SELECT =
  'id, employee_id, operator_email, challenger_session_id, incumbent_session_id, status, expires_at, created_at';

export async function createPendingLoginChallenge(input: {
  employeeId: string;
  challengerSessionId: string;
  incumbentSessionId?: string | null;
}): Promise<PendingLoginRecord | null> {
  const service = createSupabaseServiceClient();
  const expiresAt = new Date(Date.now() + PENDING_LOGIN_TIMEOUT_MS).toISOString();

  await service
    .from('portal_pending_logins')
    .update({ status: 'expired', responded_at: new Date().toISOString() })
    .eq('employee_id', input.employeeId)
    .eq('status', 'pending');

  const { data, error } = await service
    .from('portal_pending_logins')
    .insert({
      employee_id: input.employeeId,
      challenger_session_id: input.challengerSessionId,
      incumbent_session_id: input.incumbentSessionId ?? null,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select(PENDING_SELECT)
    .single();

  if (error || !data) return null;

  return mapPendingRow(data as Record<string, unknown>);
}

export async function createPendingLoginChallengeForOperator(input: {
  operatorEmail: string;
  challengerSessionId: string;
  incumbentSessionId?: string | null;
}): Promise<PendingLoginRecord | null> {
  const service = createSupabaseServiceClient();
  const normalized = input.operatorEmail.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + PENDING_LOGIN_TIMEOUT_MS).toISOString();

  await service
    .from('portal_pending_logins')
    .update({ status: 'expired', responded_at: new Date().toISOString() })
    .eq('operator_email', normalized)
    .eq('status', 'pending');

  const { data, error } = await service
    .from('portal_pending_logins')
    .insert({
      operator_email: normalized,
      challenger_session_id: input.challengerSessionId,
      incumbent_session_id: input.incumbentSessionId ?? null,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select(PENDING_SELECT)
    .single();

  if (error || !data) return null;

  return mapPendingRow(data as Record<string, unknown>);
}

export async function getActivePendingLoginForOperator(
  operatorEmail: string,
): Promise<PendingLoginRecord | null> {
  const service = createSupabaseServiceClient();
  const normalized = operatorEmail.trim().toLowerCase();
  const { data } = await service
    .from('portal_pending_logins')
    .select(PENDING_SELECT)
    .eq('operator_email', normalized)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const expiresAt = new Date(String(data.expires_at)).getTime();
  if (expiresAt <= Date.now()) {
    await service
      .from('portal_pending_logins')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('id', data.id);
    return null;
  }

  return mapPendingRow(data as Record<string, unknown>);
}

export async function getActivePendingChallengeForChallenger(input: {
  employeeId?: string | null;
  operatorEmail?: string | null;
  challengerSessionId: string;
}): Promise<PendingLoginRecord | null> {
  const pending = input.operatorEmail
    ? await getActivePendingLoginForOperator(input.operatorEmail)
    : input.employeeId
      ? await getActivePendingLoginForEmployee(input.employeeId)
      : null;

  if (!pending || pending.challengerSessionId !== input.challengerSessionId) {
    return null;
  }

  return pending;
}

export async function getActivePendingLoginForEmployee(
  employeeId: string,
): Promise<PendingLoginRecord | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('portal_pending_logins')
    .select(PENDING_SELECT)
    .eq('employee_id', employeeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const expiresAt = new Date(String(data.expires_at)).getTime();
  if (expiresAt <= Date.now()) {
    await service
      .from('portal_pending_logins')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('id', data.id);
    return null;
  }

  return mapPendingRow(data as Record<string, unknown>);
}

export async function getPendingLoginById(
  pendingId: string,
): Promise<PendingLoginRecord | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('portal_pending_logins')
    .select(PENDING_SELECT)
    .eq('id', pendingId)
    .maybeSingle();

  if (!data) return null;

  return mapPendingRow(data as Record<string, unknown>);
}

export async function resolvePendingLoginChallenge(input: {
  pendingId: string;
  action: 'approve' | 'reject';
}): Promise<{ ok: boolean; error?: string; status?: string }> {
  const pending = await getPendingLoginById(input.pendingId);
  if (!pending || pending.status !== 'pending') {
    return { ok: false, error: 'Challenge expired or not found.' };
  }

  if (new Date(pending.expiresAt).getTime() <= Date.now()) {
    const service = createSupabaseServiceClient();
    await service
      .from('portal_pending_logins')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('id', pending.id);
    return { ok: false, error: 'Challenge expired.' };
  }

  const status = input.action === 'approve' ? 'approved' : 'rejected';
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('portal_pending_logins')
    .update({
      status,
      responded_at: new Date().toISOString(),
    })
    .eq('id', pending.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, status };
}

export async function autoApproveExpiredPendingLogins(): Promise<void> {
  const service = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data } = await service
    .from('portal_pending_logins')
    .select('id, incumbent_session_id')
    .eq('status', 'pending')
    .lt('expires_at', now);

  if (!data?.length) return;

  for (const row of data) {
    if (row.incumbent_session_id) {
      await revokeSupabaseSession(String(row.incumbent_session_id));
    }
  }

  await service
    .from('portal_pending_logins')
    .update({ status: 'auto_approved', responded_at: now })
    .in(
      'id',
      data.map((row) => String(row.id)),
    );
}

export async function revokeSupabaseSession(sessionId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  await service.rpc('revoke_auth_session_by_id', {
    p_session_id: sessionId,
  });
}
