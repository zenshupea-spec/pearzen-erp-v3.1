'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import type { PortalTab } from '../../../lib/audit-portals';
import { portalKeysForTab } from '../../../lib/audit-portals';

export type AuditRow = {
  id: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  targetEntity: string;
  ipAddress: string;
};

function mapStaffRow(row: Record<string, unknown>): AuditRow {
  const details =
    row.details && typeof row.details === 'object'
      ? (row.details as Record<string, unknown>)
      : {};

  return {
    id: String(row.id),
    timestamp: row.created_at
      ? new Date(String(row.created_at)).toLocaleString('en-GB')
      : '—',
    userName:
      (typeof row.actor_name === 'string' && row.actor_name) ||
      (row.profile_id ? `Profile ${String(row.profile_id).slice(0, 8)}` : 'System'),
    userRole:
      (typeof row.actor_role === 'string' && row.actor_role) || 'Staff',
    action: String(row.action ?? 'Action'),
    targetEntity:
      (typeof row.target_entity === 'string' && row.target_entity) ||
      (row.company_id ? `Company ${String(row.company_id).slice(0, 8)}` : '—'),
    ipAddress:
      (typeof row.ip_address === 'string' && row.ip_address) ||
      (typeof details.ip === 'string' ? details.ip : '—'),
  };
}

function mapExecutiveRow(row: Record<string, unknown>): AuditRow {
  const details =
    row.details && typeof row.details === 'object'
      ? (row.details as Record<string, unknown>)
      : {};

  return {
    id: String(row.id),
    timestamp: row.created_at
      ? new Date(String(row.created_at)).toLocaleString('en-GB')
      : '—',
    userName:
      (typeof row.actor_email === 'string' && row.actor_email) || 'Executive',
    userRole: 'MD / OD',
    action: String(row.action_type ?? 'Override'),
    targetEntity:
      (typeof row.entity === 'string' && row.entity) ||
      (typeof details.summary === 'string' ? details.summary : '—'),
    ipAddress: '—',
  };
}

export async function fetchAuditLogs(portalTab?: PortalTab) {
  try {
    const supabase = await createSupabaseServerClient();

    if (portalTab === 'md-od') {
      const { data, error } = await supabase
        .from('executive_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        if (error.code === '42P01') {
          return { success: true as const, data: [] as AuditRow[] };
        }
        throw new Error(error.message);
      }

      return {
        success: true as const,
        data: (data ?? []).map((row) => mapExecutiveRow(row as Record<string, unknown>)),
      };
    }

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (portalTab) {
      const keys = portalKeysForTab(portalTab);
      if (keys.length > 0) {
        query = query.in('portal', keys);
      }
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        console.warn('⚠️ audit_logs table not created yet.');
        return { success: true as const, data: [] as AuditRow[] };
      }
      throw new Error(error.message);
    }

    return {
      success: true as const,
      data: (data ?? []).map((row) => mapStaffRow(row as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ SUPABASE ERROR (Fetch Audit Logs):', message);
    return { success: false as const, data: [] as AuditRow[], error: message };
  }
}
