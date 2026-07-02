import {
  getDaysUntilExpiry,
  isPasswordExpired,
} from '../../../packages/supabase/portal-password-expiry-math';

export type HeadOfficePasswordExpiryFields = {
  password_expires_at?: string | null;
  must_change_password?: boolean | null;
};

export type HeadOfficePasswordExpiryContext = {
  passwordExpiresAt: string | null;
  daysUntilExpiry: number | null;
  mustChangePassword: boolean;
  isPasswordExpired: boolean;
};

export function resolveHeadOfficePasswordExpiryContext(
  authRecord: HeadOfficePasswordExpiryFields,
  now: Date = new Date(),
): HeadOfficePasswordExpiryContext {
  const mustChangePassword = Boolean(authRecord.must_change_password);
  const passwordExpiresAt =
    typeof authRecord.password_expires_at === 'string'
      ? authRecord.password_expires_at
      : null;

  return {
    passwordExpiresAt,
    daysUntilExpiry: getDaysUntilExpiry(passwordExpiresAt, now),
    mustChangePassword,
    isPasswordExpired: isPasswordExpired(
      passwordExpiresAt,
      mustChangePassword,
      now,
    ),
  };
}
