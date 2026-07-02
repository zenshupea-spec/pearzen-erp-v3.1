'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../../lib/forge-access';
import {
  computeForgePartnerHealthRows,
  computeForgePlatformHealthMetrics,
  computeForgeTenantHealthRows,
  fetchLatestForgeHealthSnapshot,
  saveForgePlatformHealthSnapshot,
  type ForgePartnerHealthRow,
  type ForgePlatformHealthMetrics,
  type ForgeTenantHealthRow,
} from '../../../lib/forge-platform-health';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
}

async function assertForgeOperator() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    throw new Error('Forge operator access required');
  }
  return user.email;
}

function revalidateHealthPaths() {
  revalidatePath('/forge/health');
  revalidatePath('/forge/health/partners');
  revalidatePath('/forge/health/tenants');
}

export async function fetchForgePlatformHealthOverview() {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const [metrics, latestSnapshot] = await Promise.all([
      computeForgePlatformHealthMetrics(),
      fetchLatestForgeHealthSnapshot(),
    ]);

    return {
      success: true as const,
      metrics,
      latestSnapshot,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load platform health';
    return {
      success: false as const,
      error: message,
      metrics: null as ForgePlatformHealthMetrics | null,
      latestSnapshot: null,
    };
  }
}

export async function fetchForgeTenantHealthDashboard() {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();
    const tenants = await computeForgeTenantHealthRows();
    return { success: true as const, tenants };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tenant health';
    return {
      success: false as const,
      error: message,
      tenants: [] as ForgeTenantHealthRow[],
    };
  }
}

export async function fetchForgePartnerHealthDashboard() {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();
    const partners = await computeForgePartnerHealthRows();
    return { success: true as const, partners };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load partner health';
    return {
      success: false as const,
      error: message,
      partners: [] as ForgePartnerHealthRow[],
    };
  }
}

export async function captureForgePlatformHealthSnapshotAction(notes?: string) {
  try {
    assertServiceRoleConfigured();
    const operatorEmail = await assertForgeOperator();
    const metrics = await computeForgePlatformHealthMetrics();
    const saved = await saveForgePlatformHealthSnapshot({
      metrics,
      createdBy: operatorEmail,
      notes: notes?.trim() || null,
    });
    revalidateHealthPaths();
    return {
      success: true as const,
      snapshotId: saved.id,
      capturedAt: saved.capturedAt,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to capture snapshot';
    return { success: false as const, error: message };
  }
}
