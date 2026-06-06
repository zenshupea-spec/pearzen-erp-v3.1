'use server'

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../packages/supabase/server';
import { getSMAssignments } from '../../../lib/sm-assignments';
import {
  lookupUniformCost,
  parseUniformCatalog,
  type UniformCatalogEntry,
} from '../../../../../packages/uniform-catalog';
import {
  deductUniformVoStock,
  fetchUniformVoStockOnHand,
  restoreUniformVoStock,
  type UniformVoStockRow,
} from '../../../../../packages/uniform-vo-stock';

const CONSENT_BUCKET = 'uniform-consent-selfies';

interface UniformItem {
  item: string;
  qty: number;
}

type ActionAuth =
  | { error: string }
  | { epf: string; isDemo: boolean; userId: string | null };

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

async function resolveActionAuth(): Promise<ActionAuth> {
  const cookieStore = await cookies();
  const demoEpf = cookieStore.get('sm_demo_session')?.value?.trim().toUpperCase();
  if (demoEpf) {
    return { epf: demoEpf, isDemo: true, userId: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { error: 'Session expired. Please log in again.' };
  }

  const epf = session.user.email?.split('@')[0].toUpperCase() ?? '';
  if (!epf) {
    return { error: 'Invalid session. Please log in again.' };
  }

  return { epf, isDemo: false, userId: session.user.id };
}

async function uploadConsentSelfie(
  photoBase64: string,
  smEpf: string,
  guardEpf: string,
): Promise<string | null> {
  const decoded = decodeBase64Image(photoBase64);
  if (!decoded) return null;

  const db = createSupabaseServiceClient();
  const objectPath = `${smEpf}/${guardEpf}-${Date.now()}.${decoded.extension}`;
  const { error } = await db.storage
    .from(CONSENT_BUCKET)
    .upload(objectPath, decoded.buffer, { contentType: decoded.contentType, upsert: false });

  if (error) {
    console.error('[SM Uniform] Consent selfie upload error:', error.message);
    return null;
  }

  const { data } = db.storage.from(CONSENT_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function resolveCompanyIdForSmEpf(
  db: ReturnType<typeof createSupabaseServiceClient>,
  epf: string,
): Promise<string | null> {
  const { data } = await db
    .from('employees')
    .select('company_id')
    .eq('emp_number', epf.trim().toUpperCase())
    .maybeSingle();
  return (data as { company_id?: string | null } | null)?.company_id ?? null;
}

export async function getMyUniformStockForSM(): Promise<UniformVoStockRow[]> {
  const auth = await resolveActionAuth();
  if ('error' in auth) return [];

  const db = createSupabaseServiceClient();
  const companyId = await resolveCompanyIdForSmEpf(db, auth.epf);
  if (!companyId) return [];

  try {
    return await fetchUniformVoStockOnHand(db, companyId, auth.epf);
  } catch (err) {
    console.error('[SM Uniform] VO stock fetch:', err);
    return [];
  }
}

export async function getUniformCatalogForSM(): Promise<UniformCatalogEntry[]> {
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
): string {
  const summary = items.map((row) => `${row.qty}× ${row.item}`).join(', ');
  if (requestType === 'REQUEST_REPLACEMENT') {
    return `Uniform courier request: ${summary} — LKR ${totalAmount.toLocaleString()} (guard consent recorded; awaiting admin dispatch)`;
  }
  return `Uniform issue from stock: ${summary} — LKR ${totalAmount.toLocaleString()} (guard consent recorded)`;
}

export async function uniformRequestAction(formData: FormData) {
  const auth = await resolveActionAuth();
  if ('error' in auth) return { error: auth.error };

  const { epf, isDemo, userId } = auth;
  const db = createSupabaseServiceClient();

  const guardEpf = (formData.get('guard_epf') as string)?.trim().toUpperCase();
  const guardName = (formData.get('guard_name') as string)?.trim();
  const requestType = formData.get('request_type') as string;
  const notes = (formData.get('notes') as string)?.trim();
  const itemsRaw = formData.get('items_json') as string;
  const consentSelfieBase64 = (formData.get('consent_selfie') as string)?.trim();

  const { guards: allowedGuards } = await getSMAssignments(epf);
  const allowedGuardEpfs = new Set(allowedGuards.map((g) => g.value));

  if (!guardEpf) return { error: 'Guard EPF is required.' };
  if (allowedGuardEpfs.size > 0 && !allowedGuardEpfs.has(guardEpf)) {
    return { error: 'Selected guard is not assigned to your sector.' };
  }
  if (!requestType) return { error: 'Request type is required.' };

  let items: UniformItem[] = [];
  try {
    items = JSON.parse(itemsRaw || '[]');
  } catch {
    return { error: 'Invalid items data.' };
  }

  if (items.length === 0) return { error: 'Add at least one uniform item.' };

  const catalog = await getUniformCatalogForSM();
  const totalAmount = computeTotalAmount(catalog, items);

  const companyId = await resolveCompanyIdForSmEpf(db, epf);
  let stockDeducted = false;
  if (requestType === 'ISSUE' && !isDemo) {
    if (!companyId) {
      return { error: 'Company context required to issue from your stock on hand.' };
    }
    const stockResult = await deductUniformVoStock(db, companyId, epf, items);
    if ('error' in stockResult) return { error: stockResult.error };
    stockDeducted = true;
  }

  if (!consentSelfieBase64) {
    if (stockDeducted && companyId) {
      await restoreUniformVoStock(db, companyId, epf, items);
    }
    return { error: 'Guard consent selfie is required.' };
  }

  const { data: guard } = await db
    .from('employees')
    .select('id, full_name, company_id')
    .eq('emp_number', guardEpf)
    .maybeSingle();

  if (!guard && !isDemo) {
    return { error: `Guard ${guardEpf} not found in the system.` };
  }

  const resolvedGuardName = guard?.full_name ?? guardName ?? guardEpf;

  let consentSelfieUrl: string | null = null;
  if (consentSelfieBase64 && !isDemo) {
    consentSelfieUrl = await uploadConsentSelfie(consentSelfieBase64, epf, guardEpf);
    if (!consentSelfieUrl) {
      return { error: 'Failed to upload guard consent selfie. Please try again.' };
    }
  } else if (consentSelfieBase64 && isDemo) {
    consentSelfieUrl = 'demo://uniform-consent';
  }

  const uniformReason = formatUniformReason(items, totalAmount, requestType);
  const issueStatus = requestType === 'ISSUE' ? 'ISSUED' : 'PENDING';

  const { error } = await db.from('sm_uniform_requests').insert({
    sm_epf: epf,
    guard_epf: guardEpf,
    guard_name: resolvedGuardName,
    request_type: requestType,
    items,
    site_name: null,
    notes: notes || uniformReason,
    total_amount: totalAmount,
    consent_selfie_url: consentSelfieUrl,
    status: issueStatus,
  });

  if (error) {
    console.error('[SM Uniform] Insert error:', error.message);
    if (stockDeducted && companyId) {
      await restoreUniformVoStock(db, companyId, epf, items);
    }
    if (isDemo) {
      return {
        success: true,
        guardName: resolvedGuardName,
        amount: totalAmount,
        demo: true,
      };
    }
    return { error: 'Failed to submit request. Please try again.' };
  }

  if (requestType === 'ISSUE' && totalAmount > 0 && guard?.id) {
    const companyId = (guard as { company_id?: string | null }).company_id;
    if (!companyId) {
      console.error('[SM Uniform] Missing company_id for payroll deduction.');
      return {
        success: true,
        guardName: resolvedGuardName,
        amount: totalAmount,
        warning: 'Uniform issued but payroll deduction could not be queued (missing company).',
      };
    }

    const { error: deductionError } = await db.from('payroll_deductions').insert({
      company_id: companyId,
      guard_id: guard.id,
      category: 'UNIFORM',
      amount: totalAmount,
      reason: uniformReason,
      applied_month: currentPayrollMonth(),
      added_by: userId,
    });

    if (deductionError) {
      console.error('[SM Uniform] Payroll deduction error:', deductionError.message);
      return {
        success: true,
        guardName: resolvedGuardName,
        amount: totalAmount,
        warning: 'Uniform issued but payroll deduction failed. Contact finance.',
      };
    }
  }

  if (requestType === 'REQUEST_REPLACEMENT') {
    revalidatePath('/hq/deductions/uniform-courier');
  }

  return {
    success: true,
    guardName: resolvedGuardName,
    amount: totalAmount,
    requestType,
  };
}
