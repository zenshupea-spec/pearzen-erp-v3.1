export {
  PORTAL_PASSWORD_EXPIRY_WARN_DAYS,
  PORTAL_PASSWORD_HISTORY_DEPTH,
  PORTAL_PASSWORD_MAX_AGE_DAYS,
  SM_PORTAL_PIN_LENGTH,
  assertNotReusedPassword,
  clearPortalPasswordHistory,
  computePasswordExpiresAt,
  fetchPortalPasswordHistoryHashes,
  getDaysUntilExpiry,
  hashPortalCredential,
  hashPortalCredentialForStorage,
  isPasswordExpired,
  isPasswordExpiryWarning,
  isRepeatedPin,
  isSequentialPin,
  recordPasswordHistory,
  validateSmPortalPin,
  verifyPortalCredential,
  type PortalCredentialKind,
} from '../../../packages/supabase/portal-password-rotation';

import {
  assertNotReusedPassword,
  type PortalCredentialKind,
} from '../../../packages/supabase/portal-password-rotation';
import { validateHeadOfficePortalPassword } from './head-office-portal-password';

export function validateHeadOfficePortalPasswordRotation(
  password: string,
  reuseCheck: {
    currentHash?: string | null;
    historyHashes?: string[];
    portalKind?: PortalCredentialKind;
  },
): { ok: true } | { ok: false; error: string } {
  const complexity = validateHeadOfficePortalPassword(password);
  if (!complexity.ok) {
    return complexity;
  }

  return assertNotReusedPassword(password, {
    currentHash: reuseCheck.currentHash,
    historyHashes: reuseCheck.historyHashes,
    credentialLabel: 'password',
  });
}
