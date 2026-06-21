import { pbkdf2Sync, randomInt } from 'crypto';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  getForgeOperatorEmails,
  isForgeOperatorEmail,
  normalizeForgeOperatorEmails,
} from './forge-access';
import {
  getForgePortalAuthRecord,
  verifyForgePortalPin,
  verifyForgeTotpStepUp,
} from './forge-portal-auth';

export const FORGE_EMAIL_CHANGE_CODE_TTL_MS = 15 * 60 * 1000;
const CODE_ITERATIONS = 100_000;

export type ForgeEmailField = 'main' | 'recovery' | 'sign_in';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashEmailChangeCode(code: string, salt: string): string {
  return pbkdf2Sync(code, salt, CODE_ITERATIONS, 32, 'sha256').toString('hex');
}

function generateEmailChangeCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

function storeCodeHash(code: string): string {
  const salt = randomInt(0, 2 ** 32).toString(16).padStart(8, '0');
  return `${salt}:${hashEmailChangeCode(code, salt)}`;
}

function verifyStoredCodeHash(code: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return hashEmailChangeCode(code, salt) === hash;
}

async function sendEmailChangeCode(input: {
  to: string;
  operatorEmail: string;
  field: ForgeEmailField;
  code: string;
  isOldAddress?: boolean;
}): Promise<{ ok: boolean; emailed: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.FORGE_EMAIL_FROM?.trim() ?? 'Pearzen Forge <noreply@pearzen.tech>';

  const fieldLabel =
    input.field === 'sign_in'
      ? 'sign-in (Google) email'
      : input.field === 'recovery'
        ? 'recovery email'
        : 'main contact email';

  const body = input.isOldAddress
    ? [
        `A request was made to change your Forge ${fieldLabel}.`,
        '',
        `Operator account: ${input.operatorEmail}`,
        'If you did not request this, sign in to Forge immediately and contact the other operator.',
        '',
        'No action is required if you initiated this change.',
      ].join('\n')
    : [
        `Confirm your new Forge ${fieldLabel}.`,
        '',
        `Operator account: ${input.operatorEmail}`,
        `Verification code: ${input.code}`,
        '',
        'This code expires in 15 minutes.',
        'If you did not request this, ignore this message.',
      ].join('\n');

  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.isOldAddress
          ? 'Pearzen Forge — email change requested'
          : 'Pearzen Forge — confirm email change',
        text: body,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { ok: false, emailed: false, error: detail || `Email API ${response.status}` };
    }

    return { ok: true, emailed: true };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}

export async function getForgeOperatorEmailProfile(operatorEmail: string): Promise<{
  operatorEmail: string;
  mainEmail: string | null;
  recoveryEmail: string | null;
  signInEmail: string;
}> {
  const normalized = normalizeEmail(operatorEmail);
  const record = await getForgePortalAuthRecord(normalized);
  return {
    operatorEmail: normalized,
    mainEmail: record?.main_email ?? normalized,
    recoveryEmail: record?.recovery_email ?? null,
    signInEmail: normalized,
  };
}

async function assertForgeStepUp(
  operatorEmail: string,
  password: string,
  totpCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pin = await verifyForgePortalPin(operatorEmail, password);
  if (!pin.ok) {
    return { ok: false, error: pin.error ?? 'Invalid password.' };
  }

  const totp = await verifyForgeTotpStepUp(operatorEmail, totpCode);
  if (!totp.ok) {
    return { ok: false, error: totp.error ?? 'Invalid authenticator code.' };
  }

  return { ok: true };
}

export async function requestForgeEmailChange(input: {
  operatorEmail: string;
  field: ForgeEmailField;
  newEmail: string;
  password: string;
  totpCode: string;
}): Promise<{
  ok: boolean;
  error?: string;
  pendingId?: string;
  devNewCode?: string;
  devOldCode?: string;
  requiresOldCode?: boolean;
}> {
  const operatorEmail = normalizeEmail(input.operatorEmail);
  const newEmail = normalizeEmail(input.newEmail);

  if (!newEmail || !newEmail.includes('@')) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  if (!(await isForgeOperatorEmail(operatorEmail))) {
    return { ok: false, error: 'Not a Forge operator account.' };
  }

  const record = await getForgePortalAuthRecord(operatorEmail);
  if (!record?.two_factor_enabled) {
    return { ok: false, error: 'Enable 2FA before changing account emails.' };
  }

  const stepUp = await assertForgeStepUp(
    operatorEmail,
    input.password,
    input.totpCode,
  );
  if (!stepUp.ok) {
    return { ok: false, error: stepUp.error };
  }

  const currentMain = record.main_email?.trim() || operatorEmail;
  const currentRecovery = record.recovery_email?.trim() || null;

  if (input.field === 'main' && newEmail === normalizeEmail(currentMain)) {
    return { ok: false, error: 'That is already your main email.' };
  }
  if (input.field === 'recovery' && newEmail === normalizeEmail(currentRecovery ?? '')) {
    return { ok: false, error: 'That is already your recovery email.' };
  }
  if (input.field === 'sign_in' && newEmail === operatorEmail) {
    return { ok: false, error: 'That is already your sign-in email.' };
  }

  if (input.field === 'sign_in' && !(await isForgeOperatorEmail(newEmail))) {
    return {
      ok: false,
      error:
        'Add the new Gmail to the operator allowlist first (swap with the other slot in Access Control).',
    };
  }

  const newCode = generateEmailChangeCode();
  const oldCode = input.field === 'sign_in' ? generateEmailChangeCode() : null;

  const service = createSupabaseServiceClient();
  await service
    .from('forge_email_change_requests')
    .update({ consumed_at: new Date().toISOString() })
    .eq('operator_email', operatorEmail)
    .eq('field', input.field)
    .is('consumed_at', null);

  const expiresAt = new Date(Date.now() + FORGE_EMAIL_CHANGE_CODE_TTL_MS).toISOString();
  const { data, error } = await service
    .from('forge_email_change_requests')
    .insert({
      operator_email: operatorEmail,
      field: input.field,
      new_email: newEmail,
      code_hash: storeCodeHash(newCode),
      old_code_hash: oldCode ? storeCodeHash(oldCode) : null,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not start email change.' };
  }

  const notifyOld =
    input.field === 'main'
      ? currentMain
      : input.field === 'recovery'
        ? currentRecovery || currentMain
        : operatorEmail;

  const mailNew = await sendEmailChangeCode({
    to: newEmail,
    operatorEmail,
    field: input.field,
    code: newCode,
  });
  if (!mailNew.ok) {
    return { ok: false, error: mailNew.error };
  }

  if (notifyOld && notifyOld !== newEmail) {
    await sendEmailChangeCode({
      to: notifyOld,
      operatorEmail,
      field: input.field,
      code: newCode,
      isOldAddress: true,
    });
  }

  if (input.field === 'sign_in' && oldCode) {
    const mailOld = await sendEmailChangeCode({
      to: operatorEmail,
      operatorEmail,
      field: input.field,
      code: oldCode,
    });
    if (!mailOld.ok) {
      return { ok: false, error: mailOld.error };
    }
  }

  return {
    ok: true,
    pendingId: String(data.id),
    requiresOldCode: input.field === 'sign_in',
    devNewCode: mailNew.emailed ? undefined : newCode,
    devOldCode:
      input.field === 'sign_in' && !process.env.RESEND_API_KEY
        ? oldCode ?? undefined
        : undefined,
  };
}

export async function confirmForgeEmailChange(input: {
  operatorEmail: string;
  field: ForgeEmailField;
  newEmail: string;
  newCode: string;
  oldCode?: string;
}): Promise<{ ok: boolean; error?: string; signOutRequired?: boolean }> {
  const operatorEmail = normalizeEmail(input.operatorEmail);
  const newEmail = normalizeEmail(input.newEmail);

  const service = createSupabaseServiceClient();
  const { data: pending } = await service
    .from('forge_email_change_requests')
    .select('id, code_hash, old_code_hash, expires_at, new_email, field')
    .eq('operator_email', operatorEmail)
    .eq('field', input.field)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return { ok: false, error: 'No pending email change. Request a new code.' };
  }

  if (new Date(String(pending.expires_at)).getTime() <= Date.now()) {
    return { ok: false, error: 'Verification code expired. Start again.' };
  }

  if (normalizeEmail(String(pending.new_email)) !== newEmail) {
    return { ok: false, error: 'Email does not match the pending change.' };
  }

  if (!verifyStoredCodeHash(input.newCode.trim(), String(pending.code_hash))) {
    return { ok: false, error: 'Invalid verification code for the new email.' };
  }

  if (input.field === 'sign_in') {
    const oldHash = pending.old_code_hash;
    if (!oldHash || !input.oldCode) {
      return { ok: false, error: 'Enter the code sent to your current sign-in email.' };
    }
    if (!verifyStoredCodeHash(input.oldCode.trim(), String(oldHash))) {
      return { ok: false, error: 'Invalid verification code for your current sign-in email.' };
    }

    const migrated = await migrateForgeSignInEmail(operatorEmail, newEmail);
    if (!migrated.ok) {
      return { ok: false, error: migrated.error };
    }
  } else if (input.field === 'main') {
    await service
      .from('forge_portal_auth')
      .update({
        main_email: newEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('operator_email', operatorEmail);
  } else {
    await service
      .from('forge_portal_auth')
      .update({
        recovery_email: newEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('operator_email', operatorEmail);
  }

  await service
    .from('forge_email_change_requests')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', pending.id);

  return {
    ok: true,
    signOutRequired: input.field === 'sign_in',
  };
}

async function migrateForgeSignInEmail(
  oldEmail: string,
  newEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const service = createSupabaseServiceClient();
  const record = await getForgePortalAuthRecord(oldEmail);
  if (!record) {
    return { ok: false, error: 'Forge auth record not found.' };
  }

  const allowlist = await getForgeOperatorEmails();
  if (!allowlist.includes(newEmail)) {
    return { ok: false, error: 'New email is not on the Forge operator allowlist.' };
  }

  const updatedAllowlist = normalizeForgeOperatorEmails(
    allowlist.map((entry) => (entry === oldEmail ? newEmail : entry)),
  );

  const { error: settingsError } = await service.from('forge_settings').upsert(
    {
      singleton: true,
      operator_emails: updatedAllowlist,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'singleton' },
  );
  if (settingsError) {
    return { ok: false, error: settingsError.message };
  }

  const { data: authUser } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = authUser?.users?.find(
    (entry) => entry.email?.trim().toLowerCase() === oldEmail,
  );

  if (user?.id) {
    const { error: authError } = await service.auth.admin.updateUserById(user.id, {
      email: newEmail,
      email_confirm: true,
    });
    if (authError) {
      return { ok: false, error: authError.message };
    }
  }

  const { error: insertError } = await service.from('forge_portal_auth').upsert(
    {
      operator_email: newEmail,
      main_email: newEmail,
      recovery_email: record.recovery_email,
      pin_hash: record.pin_hash,
      unlock_code_hash: record.unlock_code_hash,
      totp_secret: record.totp_secret,
      two_factor_enabled: record.two_factor_enabled,
      totp_backup_code_hashes: record.totp_backup_code_hashes,
      needs_pin_setup: record.needs_pin_setup,
      failed_password_attempts: 0,
      failed_2fa_attempts: 0,
      is_locked: false,
      locked_until: null,
      od_2fa_recovery_locked_until: record.od_2fa_recovery_locked_until,
      temp_password_issued_at: record.temp_password_issued_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'operator_email' },
  );
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  await service.from('forge_portal_auth').delete().eq('operator_email', oldEmail);

  return { ok: true };
}
