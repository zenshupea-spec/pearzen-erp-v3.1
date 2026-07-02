import { pbkdf2Sync, randomInt } from 'crypto';

import {
  EXECUTIVE_PORTAL_OTP_EXPIRES_MINUTES,
  EXECUTIVE_PORTAL_OTP_LIFETIME_MS,
} from './executive-portal-auth-policy';

export const EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS = EXECUTIVE_PORTAL_OTP_LIFETIME_MS;

const CODE_ITERATIONS = 100_000;

function hashRecoveryEmailChangeCode(code: string, salt: string): string {
  return pbkdf2Sync(code, salt, CODE_ITERATIONS, 32, 'sha256').toString('hex');
}

export function storeRecoveryEmailChangeCodeHash(code: string): string {
  const salt = randomInt(0, 2 ** 32).toString(16).padStart(8, '0');
  return `${salt}:${hashRecoveryEmailChangeCode(code, salt)}`;
}

export function verifyRecoveryEmailChangeCodeHash(
  code: string,
  stored: string,
): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return hashRecoveryEmailChangeCode(code.trim(), salt) === hash;
}

export function buildExecutiveRecoveryEmailVerificationEmailBody(input: {
  staffName: string;
  workEmail: string;
  otp: string;
  expiresMinutes: number;
}): { subject: string; text: string } {
  const minutes = Math.max(1, Math.round(input.expiresMinutes));
  const minuteLabel = minutes === 1 ? 'minute' : 'minutes';

  return {
    subject: 'MD Portal — confirm your new recovery email',
    text: [
      `Hello ${input.staffName.trim() || 'there'},`,
      '',
      'Use this code to confirm your new MD Portal recovery email address:',
      '',
      input.otp,
      '',
      `This 6-digit code expires in ${minutes} ${minuteLabel}.`,
      '',
      `Work email on file: ${input.workEmail}`,
      '',
      'If you did not request this change, contact Pearzen SaaS Forge immediately.',
      '',
      '— Classic Venture Security',
    ].join('\n'),
  };
}

export const EXECUTIVE_RECOVERY_EMAIL_OTP_EXPIRES_MINUTES =
  EXECUTIVE_PORTAL_OTP_EXPIRES_MINUTES;

export function buildExecutiveWorkEmailChangeOtpEmailBody(input: {
  staffName: string;
  currentWorkEmail: string;
  newWorkEmail: string;
  otp: string;
  expiresMinutes: number;
  sendOtpTo: 'work' | 'recovery';
}): { subject: string; text: string } {
  const minutes = Math.max(1, Math.round(input.expiresMinutes));
  const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
  const destinationLabel =
    input.sendOtpTo === 'recovery'
      ? 'your recovery email inbox'
      : 'your current work email inbox';

  return {
    subject: 'MD Portal — confirm your new work email',
    text: [
      `Hello ${input.staffName.trim() || 'there'},`,
      '',
      `Use this code to confirm changing your MD Portal work email to ${input.newWorkEmail}.`,
      '',
      input.otp,
      '',
      `This 6-digit code was sent to ${destinationLabel} and expires in ${minutes} ${minuteLabel}.`,
      '',
      `Current work email: ${input.currentWorkEmail}`,
      '',
      'If you did not request this change, contact Pearzen SaaS Forge immediately.',
      '',
      '— Classic Venture Security',
    ].join('\n'),
  };
}
