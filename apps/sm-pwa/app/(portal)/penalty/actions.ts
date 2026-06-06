'use server'

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';
import { getCurrentSmEpf, getSMAssignments } from '../../../lib/sm-assignments';
import {
  DEFAULT_PENALTY_CATALOG,
  parsePenaltyCatalog,
  type PenaltyCatalogEntry,
} from '../../../../../packages/penalty-catalog';

const CONSENT_BUCKET = 'penalty-consent-selfies';

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

async function uploadConsentSelfie(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  photoBase64: string,
  smEpf: string,
  guardEpf: string,
): Promise<string | null> {
  const decoded = decodeBase64Image(photoBase64);
  if (!decoded) return null;

  const objectPath = `${smEpf}/${guardEpf}-${Date.now()}.${decoded.extension}`;
  const { error } = await supabase.storage
    .from(CONSENT_BUCKET)
    .upload(objectPath, decoded.buffer, { contentType: decoded.contentType, upsert: false });

  if (error) {
    console.error('[SM Penalty] Consent selfie upload error:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(CONSENT_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function getPenaltyCatalogForSM(): Promise<PenaltyCatalogEntry[]> {
  const supabase = await createSupabaseServerClient();

  const { data: settings } = await supabase
    .from('md_settings')
    .select('penalty_catalog')
    .limit(1)
    .maybeSingle();

  return parsePenaltyCatalog((settings as { penalty_catalog?: unknown } | null)?.penalty_catalog);
}

export async function issuePenaltyAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const epf = session.user.email?.split('@')[0].toUpperCase() ?? '';

  const guardEpf = (formData.get('guard_epf') as string)?.trim().toUpperCase();
  const guardName = (formData.get('guard_name') as string)?.trim();
  const penaltyCatalogIds = [...new Set(formData.getAll('penalty_catalog_id').map(String).filter(Boolean))];
  const consentSelfieBase64 = (formData.get('consent_selfie') as string)?.trim();

  const smEpf = await getCurrentSmEpf();
  if (!smEpf || smEpf !== epf) redirect('/login');

  const { guards: allowedGuards } = await getSMAssignments(epf);
  const allowedGuardEpfs = new Set(allowedGuards.map((g) => g.value));

  if (!guardEpf) return { error: 'Guard EPF is required.' };
  if (allowedGuardEpfs.size > 0 && !allowedGuardEpfs.has(guardEpf)) {
    return { error: 'Selected guard is not assigned to your sites.' };
  }
  if (penaltyCatalogIds.length === 0) return { error: 'Please select at least one disciplinary offense.' };
  if (!consentSelfieBase64) return { error: 'Guard consent selfie is required.' };

  const catalog = await getPenaltyCatalogForSM();
  const offenses = penaltyCatalogIds
    .map((id) => catalog.find((entry) => entry.id === id))
    .filter((entry): entry is PenaltyCatalogEntry => entry != null);

  if (offenses.length !== penaltyCatalogIds.length) {
    return { error: 'One or more selected offenses are no longer in the penalty catalog.' };
  }

  const totalFine = offenses.reduce((sum, entry) => sum + entry.fine, 0);
  const offenseSummary = offenses.map((entry) => entry.offense).join('; ');

  const { data: guard } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('emp_number', guardEpf)
    .single();

  if (!guard) return { error: `Guard ${guardEpf} not found in the system.` };

  const consentSelfieUrl = await uploadConsentSelfie(supabase, consentSelfieBase64, epf, guardEpf);
  if (!consentSelfieUrl) {
    return { error: 'Failed to upload guard consent selfie. Please try again.' };
  }

  const reason =
    offenses.length === 1
      ? `Disciplinary penalty: ${offenses[0].offense} — LKR ${offenses[0].fine.toLocaleString()} (guard consent recorded)`
      : `Disciplinary penalty (${offenses.length} offenses): ${offenses
          .map((entry) => `${entry.offense} — LKR ${entry.fine.toLocaleString()}`)
          .join('; ')} — Total LKR ${totalFine.toLocaleString()} (guard consent recorded)`;

  const { error } = await supabase.from('sm_guard_penalties').insert({
    sm_epf: epf,
    guard_epf: guardEpf,
    guard_name: guard.full_name ?? guardName ?? null,
    penalty_type: offenseSummary,
    penalty_catalog_id: offenses.map((entry) => entry.id).join(','),
    reason,
    deduction_amount: totalFine,
    consent_selfie_url: consentSelfieUrl,
    status: 'PENDING',
  });

  if (error) {
    console.error('[SM Penalty] Insert error:', error.message);
    return { error: 'Failed to issue penalty. Please try again.' };
  }

  return { success: true, guardName: guard.full_name, amount: totalFine, offense: offenseSummary };
}
