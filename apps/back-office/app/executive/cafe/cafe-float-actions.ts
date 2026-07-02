'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { colomboTodayIso } from '../../../lib/guard-verification-dates';
import { auditStaffAction } from '../../../lib/staff-audit';
import { listCafeBranches } from './actions';

export type CafeFloatSession = {
  id: string;
  businessDate: string;
  openingFloatLkr: number;
  posCashSalesLkr: number;
  expectedCashLkr: number;
  declaredCashLkr: number | null;
  varianceLkr: number | null;
  notes: string;
  reconciledBy: string | null;
  reconciledAt: string | null;
};

export type CafeFloatDeskPayload = {
  businessDate: string;
  session: CafeFloatSession | null;
  recentSessions: CafeFloatSession[];
  error?: string;
};

type FloatRow = {
  id: string;
  business_date: string;
  opening_float_lkr: number;
  pos_cash_sales_lkr: number;
  expected_cash_lkr: number;
  declared_cash_lkr: number | null;
  variance_lkr: number | null;
  notes: string;
  reconciled_by: string | null;
  reconciled_at: string | null;
};

function nextColomboDayStart(businessDate: string): string {
  const [year, month, day] = businessDate.split('-').map(Number);
  const next = new Date(year, month - 1, day + 1);
  const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  return `${iso}T00:00:00+05:30`;
}

function mapFloatRow(row: FloatRow): CafeFloatSession {
  return {
    id: row.id,
    businessDate: row.business_date,
    openingFloatLkr: Number(row.opening_float_lkr ?? 0),
    posCashSalesLkr: Number(row.pos_cash_sales_lkr ?? 0),
    expectedCashLkr: Number(row.expected_cash_lkr ?? 0),
    declaredCashLkr:
      row.declared_cash_lkr == null ? null : Number(row.declared_cash_lkr),
    varianceLkr: row.variance_lkr == null ? null : Number(row.variance_lkr),
    notes: row.notes ?? '',
    reconciledBy: row.reconciled_by,
    reconciledAt: row.reconciled_at,
  };
}

async function resolveCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  return resolveCompanyIdForSession(supabase);
}

async function sumPosCashSalesLkr(
  companyId: string,
  businessDate: string,
): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const dayStart = `${businessDate}T00:00:00+05:30`;
  const dayEnd = nextColomboDayStart(businessDate);

  const { data, error } = await supabase
    .from('cafe_customer_orders')
    .select('total_lkr')
    .eq('company_id', companyId)
    .eq('status', 'COMPLETED')
    .eq('payment_method', 'cash_at_counter')
    .gte('completed_at', dayStart)
    .lt('completed_at', dayEnd);

  if (error) throw new Error(error.message);

  const total = (data ?? []).reduce(
    (sum, row) => sum + Math.round(Number(row.total_lkr ?? 0)),
    0,
  );
  return total;
}

export async function getCafeFloatDesk(
  locationIdInput?: string | null,
  businessDateInput?: string | null,
): Promise<CafeFloatDeskPayload> {
  noStore();
  const companyId = await resolveCompanyId();
  const businessDate = businessDateInput?.trim() || colomboTodayIso();

  if (!companyId) {
    return {
      businessDate,
      session: null,
      recentSessions: [],
      error: 'No company context',
    };
  }

  try {
    const { branches, error: branchError } = await listCafeBranches();
    if (branchError) {
      return { businessDate, session: null, recentSessions: [], error: branchError };
    }

    const locationId =
      locationIdInput && branches.some((branch) => branch.id === locationIdInput)
        ? locationIdInput
        : branches[0]?.id;

    if (!locationId) {
      return {
        businessDate,
        session: null,
        recentSessions: [],
        error: 'No café branch configured',
      };
    }

    const supabase = createSupabaseServiceClient();
    const posCashSalesLkr = await sumPosCashSalesLkr(companyId, businessDate);

    const { data: existing, error: loadError } = await supabase
      .from('cafe_cash_float_sessions')
      .select('*')
      .eq('company_id', companyId)
      .eq('cafe_location_id', locationId)
      .eq('business_date', businessDate)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);

    let session: CafeFloatSession | null = null;

    if (existing) {
      const openingFloatLkr = Number(existing.opening_float_lkr ?? 0);
      const expectedCashLkr = openingFloatLkr + posCashSalesLkr;
      session = mapFloatRow({
        ...(existing as FloatRow),
        pos_cash_sales_lkr: posCashSalesLkr,
        expected_cash_lkr: expectedCashLkr,
      });
    } else {
      session = {
        id: '',
        businessDate,
        openingFloatLkr: 0,
        posCashSalesLkr,
        expectedCashLkr: posCashSalesLkr,
        declaredCashLkr: null,
        varianceLkr: null,
        notes: '',
        reconciledBy: null,
        reconciledAt: null,
      };
    }

    const { data: recentRows, error: recentError } = await supabase
      .from('cafe_cash_float_sessions')
      .select('*')
      .eq('company_id', companyId)
      .eq('cafe_location_id', locationId)
      .not('reconciled_at', 'is', null)
      .order('business_date', { ascending: false })
      .limit(14);

    if (recentError) throw new Error(recentError.message);

    return {
      businessDate,
      session,
      recentSessions: (recentRows ?? []).map((row) => mapFloatRow(row as FloatRow)),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load cash float desk';
    return { businessDate, session: null, recentSessions: [], error: message };
  }
}

export async function saveCafeFloatReconciliation(input: {
  locationId: string;
  businessDate: string;
  openingFloatLkr: number;
  declaredCashLkr: number;
  notes?: string;
}): Promise<{ ok: boolean; error?: string; session?: CafeFloatSession }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const businessDate = input.businessDate.trim();
  const openingFloatLkr = Math.max(0, Math.round(input.openingFloatLkr));
  const declaredCashLkr = Math.max(0, Math.round(input.declaredCashLkr));
  const notes = (input.notes ?? '').trim();

  try {
    const posCashSalesLkr = await sumPosCashSalesLkr(companyId, businessDate);
    const expectedCashLkr = openingFloatLkr + posCashSalesLkr;
    const varianceLkr = declaredCashLkr - expectedCashLkr;

    const sessionClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    const reconciledBy = user?.email ?? 'SYSTEM';

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('cafe_cash_float_sessions')
      .upsert(
        {
          company_id: companyId,
          cafe_location_id: input.locationId,
          business_date: businessDate,
          opening_float_lkr: openingFloatLkr,
          pos_cash_sales_lkr: posCashSalesLkr,
          expected_cash_lkr: expectedCashLkr,
          declared_cash_lkr: declaredCashLkr,
          variance_lkr: varianceLkr,
          notes,
          reconciled_by: reconciledBy,
          reconciled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,cafe_location_id,business_date' },
      )
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await auditStaffAction({
      supabase: sessionClient,
      portal: 'cafe',
      action: 'Reconcile Cash Float',
      targetEntity: `${businessDate} · variance LKR ${varianceLkr}`,
    });

    revalidatePath('/executive/cafe/float');

    return { ok: true, session: mapFloatRow(data as FloatRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save float reconciliation';
    return { ok: false, error: message };
  }
}
