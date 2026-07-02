'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import type { PortalTab } from '../../../lib/audit-portals';
import { portalKeysForTab } from '../../../lib/audit-portals';
import {
  assertAuditLedgerReadAccess,
  AuditLedgerAccessError,
} from '../../../lib/audit-ledger-access';
import {
  listPortalLoginEventsForCompany,
  type CompanyPortalLoginEvent,
} from '../../../lib/portal-login-events';

export type AuditRow = {
  id: string;
  /** ISO timestamp from DB — used for date filter and sort */
  createdAt: string;
  /** Human-readable display timestamp */
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  targetEntity: string;
  ipAddress: string;
};

export type FetchAuditLogsResult =
  | { success: true; data: AuditRow[] }
  | { success: false; forbidden?: true; data: AuditRow[]; error: string };

function mapStaffRow(row: Record<string, unknown>): AuditRow {
  const details =
    row.details && typeof row.details === 'object'
      ? (row.details as Record<string, unknown>)
      : {};

  return {
    id: String(row.id),
    createdAt: row.created_at ? String(row.created_at) : '',
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
    createdAt: row.created_at ? String(row.created_at) : '',
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

function mapLoginEventRow(event: CompanyPortalLoginEvent): AuditRow {
  const label = event.eventType.replace(/_/g, ' ');
  return {
    id: event.id,
    createdAt: event.createdAt,
    timestamp: new Date(event.createdAt).toLocaleString('en-GB'),
    userName: event.employeeName ?? event.portalAuthEmail ?? 'Unknown',
    userRole: event.employeeRank ?? 'HO Staff',
    action: event.success ? label : `${label} (failed)`,
    targetEntity: event.detail ?? event.deviceLabel ?? 'Head Office portal',
    ipAddress: event.ipAddress ?? '—',
  };
}

export async function fetchAuditLogs(portalTab?: PortalTab): Promise<FetchAuditLogsResult> {
  try {
    const { supabase, companyId, portalTab: tab } = await assertAuditLedgerReadAccess(
      portalTab,
    );

    if (tab === 'security') {
      const events = await listPortalLoginEventsForCompany(companyId, 200);
      return {
        success: true,
        data: events.map(mapLoginEventRow),
      };
    }

    if (tab === 'md-od') {
      const { data, error } = await supabase
        .from('executive_audit_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        if (error.code === '42P01') {
          return { success: true, data: [] };
        }
        throw new Error(error.message);
      }

      return {
        success: true,
        data: (data ?? []).map((row) => mapExecutiveRow(row as Record<string, unknown>)),
      };
    }

    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(200);

    const keys = portalKeysForTab(tab);
    if (keys.length > 0) {
      query = query.in('portal', keys);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        console.warn('⚠️ audit_logs table not created yet.');
        return { success: true, data: [] };
      }
      throw new Error(error.message);
    }

    return {
      success: true,
      data: (data ?? []).map((row) => mapStaffRow(row as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    if (error instanceof AuditLedgerAccessError) {
      return {
        success: false,
        forbidden: true,
        data: [],
        error: error.message,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ SUPABASE ERROR (Fetch Audit Logs):', message);
    return { success: false, data: [], error: message };
  }
}
