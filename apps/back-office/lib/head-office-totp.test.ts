import { describe, expect, it } from 'vitest';

import {
  encryptHeadOfficeTotpSecret,
  generateHeadOfficeTotpCode,
  generateHeadOfficeTotpSecret,
  isEncryptedHeadOfficeTotpSecret,
  resolveHeadOfficeTotpSecret,
  verifyHeadOfficeTotpCode,
} from './head-office-totp';

describe('head-office-totp encryption', () => {
  it('encrypts and resolves secrets for verification', () => {
    const plain = generateHeadOfficeTotpSecret();
    const stored = encryptHeadOfficeTotpSecret(plain);

    expect(isEncryptedHeadOfficeTotpSecret(stored)).toBe(true);
    expect(resolveHeadOfficeTotpSecret(stored)).toBe(plain);

    const code = generateHeadOfficeTotpCode(plain);
    expect(verifyHeadOfficeTotpCode(resolveHeadOfficeTotpSecret(stored)!, code)).toBe(true);
  });

  it('resolves legacy plain base32 secrets', () => {
    const plain = 'JBSWY3DPEHPK3PXP';
    expect(resolveHeadOfficeTotpSecret(plain)).toBe(plain);
    expect(isEncryptedHeadOfficeTotpSecret(plain)).toBe(false);
  });
});
