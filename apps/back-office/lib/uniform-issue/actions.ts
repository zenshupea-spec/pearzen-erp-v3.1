'use server';

import { revalidatePath } from 'next/cache';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../lib/company-context';
import {
  lookupUniformCost,
  parseUniformCatalog,
  type UniformCatalogEntry,
} from '../../../../packages/uniform-catalog';
import {
  deductUniformVoStock,
  restoreUniformVoStock,
} from '../../../../packages/uniform-vo-stock';
import type { UniformIssuePortal } from './types';

const CONSENT_BUCKET = 'uniform-consent-selfies';

interface UniformItem {
  item: string;
  qty: number;
}

function decodeBase64Image(photoBase64: string): {
  buffer: Buffer;
  contentType: string;
  extension: string;
} | null {
  const trimmed = photoBase64.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!dataUrlMatch) return null;

  const contentType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2];
  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extByMime[contentType] ?? 'jpg';
  return { buffer: Buffer.from(base64Data, 'base64'), contentType, extension };
}

async function resolveIssuer(): Promise<
  { error: string } | { issuerEpf: string; userId: string | null }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized — sign in again.' };

  const issuerEpf = user.email?.split('@')[0].trim().toUpperCase() ?? '';
  if (!issuerEpf) return { error: 'Could not resolve your staff EPF from session.' };

  return { issuerEpf, userId: user.id };
}

async function uploadConsentSelfie(
  photoBase64: string,
  issuerEpf: string,
  guardEpf: string,
): Promise<string | null> {
  const decoded = decodeBase64Image(photoBase64);
  if (!decoded) return null;

  const db = createSupabaseServiceClient();
  const objectPath = `${issuerEpf}/${guardEpf}-${Date.now()}.${decoded.extension}`;
  const { error } = await db.storage
    .from(CONSENT_BUCKET)
    .upload(objectPath, decoded.buffer, { contentType: decoded.contentType, upsert: false });

  if (error) {
    console.error('[Uniform issue] Consent selfie upload:', error.message);
    return null;
  }

  const { data } = db.storage.from(CONSENT_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function getUniformCatalogForIssue(): Promise<UniformCatalogEntry[]> {
  const db = createSupabaseServiceClient();

  const { data: settings } = await db
    .from('md_settings')
    .select('uniform_catalog')
    .limit(1)
    .maybeSingle();

  return parseUniformCatalog((settings as { uniform_catalog?: unknown } | null)?.uniform_catalog);
}

function computeTotalAmount(catalog: UniformCatalogEntry[], items: UniformItem[]): number {
  return items.reduce((sum, row) => sum + lookupUniformCost(catalog, row.item) * row.qty, 0);
}

function currentPayrollMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatUniformReason(
  items: UniformItem[],
  totalAmount: number,
  requestType: string,
  portal: UniformIssuePortal,
): string {
  const summary = items.map((row) => `${row.qty}× ${row.item}`).join(', ');
  const prefix = `${portal} uniform`;
  if (requestType === 'REQUEST_REPLACEMENT') {
    return `${prefix} courier request: ${summary} — LKR ${totalAmount.toLocaleString()} (guard consent recorded)`;
  }
  return `${prefix} issue from stock: ${summary} — LKR ${totalAmount.toLocaleString()} (guard consent recorded)`;
}

export async function uniformIssueAction(formData: FormData) {
  const issuer = await resolveIssuer();
  if ('error' in issuer) return { error: issuer.error };

  const portal = (formData.get('portal') as UniformIssuePortal) || 'HQ';
  const { issuerEpf, userId } = issuer;
  const db = createSupabaseServiceClient();
  const companyId = await resolveCompanyIdForSession(await createSupabaseServerClient());

  const guardEpf = (formData.get('guard_epf') as string)?.trim().toUpperCase();
  const guardName = (formData.get('guard_name') as string)?.trim();
  const requestType = formData.get('request_type') as string;
  const itemsRaw = formData.get('items_json') as string;
  const consentSelfieBase64 = (formData.get('consent_selfie') as string)?.trim();

  if (!guardEpf) return { error: 'Guard EPF is required.' };
  if (!requestType) return { error: 'Request type is required.' };

  let items: UniformItem[] = [];
  try {
    items = JSON.parse(itemsRaw || '[]');
  } catch {
    return { error: 'Invalid items data.' };
  }

  if (items.length === 0) return { error: 'Add at least one uniform item.' };
  if (!consentSelfieBase64) return { error: 'Guard consent selfie is required.' };

  const catalog = await getUniformCatalogForIssue();
  const totalAmount = computeTotalAmount(catalog, items);

  let stockDeducted = false;
  if (requestType === 'ISSUE') {
    if (!companyId) {
      return { error: 'Company context required to issue from your stock on hand.' };
    }
    const stockResult = await deductUniformVoStock(db, companyId, issuerEpf, items);
    if ('error' in stockResult) return { error: stockResult.error };
    stockDeducted = true;
  }

  let guardQuery = db
    .from('employees')
    .select('id, full_name, company_id')
    .eq('emp_number', guardEpf)
    .eq('status', 'ACTIVE');

  if (companyId) guardQuery = guardQuery.eq('company_id', companyId);

  const { data: guard } = await guardQuery.maybeSingle();

  if (!guard) {
    if (stockDeducted && companyId) {
      await restoreUniformVoStock(db, companyId, issuerEpf, items);
    }
    return { error: `Guard ${guardEpf} not found in the system.` };
  }

  const resolvedGuardName = guard.full_name ?? guardName ?? guardEpf;

  const consentSelfieUrl = await uploadConsentSelfie(consentSelfieBase64, issuerEpf, guardEpf);
  if (!consentSelfieUrl) {
    if (stockDeducted && companyId) {
      await restoreUniformVoStock(db, companyId, issuerEpf, items);
    }
    return { error: 'Failed to upload guard consent selfie. Please try again.' };
  }

  const uniformReason = formatUniformReason(items, totalAmount, requestType, portal);
  const issueStatus = requestType === 'ISSUE' ? 'ISSUED' : 'PENDING';

  const { error } = await db.from('sm_uniform_requests').insert({
    sm_epf: issuerEpf,
    guard_epf: guardEpf,
    guard_name: resolvedGuardName,
    request_type: requestType,
    items,
    site_name: null,
    notes: uniformReason,
    total_amount: totalAmount,
    consent_selfie_url: consentSelfieUrl,
    status: issueStatus,
  });

  if (error) {
    console.error('[Uniform issue] Insert error:', error.message);
    if (stockDeducted && companyId) {
      await restoreUniformVoStock(db, companyId, issuerEpf, items);
    }
    return { error: 'Failed to submit request. Please try again.' };
  }

  if (requestType === 'ISSUE' && totalAmount > 0 && guard.id) {
    const guardCompanyId = (guard as { company_id?: string | null }).company_id;
    if (!guardCompanyId) {
      return {
        success: true,
        guardName: resolvedGuardName,
        amount: totalAmount,
        warning: 'Uniform issued but payroll deduction could not be queued (missing company).',
      };
    }

    const { error: deductionError } = await db.from('payroll_deductions').insert({
      company_id: guardCompanyId,
      guard_id: guard.id,
      category: 'UNIFORM',
      amount: totalAmount,
      reason: uniformReason,
      applied_month: currentPayrollMonth(),
      added_by: userId,
      approval_status: 'APPROVED',
    });

    if (deductionError) {
      console.error('[Uniform issue] Payroll deduction error:', deductionError.message);
      return {
        success: true,
        guardName: resolvedGuardName,
        amount: totalAmount,
        warning: 'Uniform issued but payroll deduction failed. Contact finance.',
      };
    }
  }

  revalidatePath('/hq/deductions');
  revalidatePath('/hq/deductions/uniform-issue');
  revalidatePath('/hq/deductions/uniform-courier');
  revalidatePath('/tm/uniform');
  revalidatePath('/om/uniform');

  return {
    success: true,
    guardName: resolvedGuardName,
    amount: totalAmount,
    requestType,
  };
}
