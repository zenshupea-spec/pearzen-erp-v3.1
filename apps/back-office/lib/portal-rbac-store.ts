import {
  lockedPortalRbacRowForRank,
  mergeStaffWithPortalRbac,
  parsePortalRbacMatrix,
  type PortalAccessLevel,
  type PortalRbacMatrix,
} from '../../../packages/portal-rbac';
import {
  isMissingColumnError,
  MD_SETTINGS_ENVELOPE_KEYS,
  parseSettingEnvelope,
} from '../../../packages/supabase/md-settings-envelope';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export async function readPortalRbacMatrixForCompany(
  companyId: string,
): Promise<PortalRbacMatrix> {
  const supabase = createSupabaseServiceClient();

  let { data, error } = await supabase
    .from('md_settings')
    .select('portal_rbac_matrix, setting_value')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase
      .from('md_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .maybeSingle());
  }

  if (error) {
    console.error('readPortalRbacMatrixForCompany:', error.message);
    return {};
  }

  const row = data as { portal_rbac_matrix?: unknown; setting_value?: unknown } | null;
  if (row?.portal_rbac_matrix) {
    return parsePortalRbacMatrix(row.portal_rbac_matrix);
  }

  const envelope = parseSettingEnvelope(row?.setting_value);
  return parsePortalRbacMatrix(envelope[MD_SETTINGS_ENVELOPE_KEYS.portalRbacMatrix]);
}

export async function resolveEmployeePortalRbacRow(input: {
  companyId: string | null;
  employeeId: string;
  rank: string | null;
}): Promise<Record<string, PortalAccessLevel>> {
  const locked = lockedPortalRbacRowForRank(input.rank);
  if (locked) return locked;

  if (!input.companyId) {
    return mergeStaffWithPortalRbac(
      [{ id: input.employeeId, fullName: '', rank: input.rank, email: null, status: 'ACTIVE' }],
      {},
    )[input.employeeId];
  }

  const saved = await readPortalRbacMatrixForCompany(input.companyId);
  return mergeStaffWithPortalRbac(
    [{ id: input.employeeId, fullName: '', rank: input.rank, email: null, status: 'ACTIVE' }],
    saved,
  )[input.employeeId];
}
