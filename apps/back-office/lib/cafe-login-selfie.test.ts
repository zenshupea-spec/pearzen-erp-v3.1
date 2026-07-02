import { describe, expect, it } from 'vitest';

import {
  CAFE_LOGIN_SELFIE_MIN_BYTES,
  decodeCafeLoginSelfieDataUrl,
  validateCafeLoginSelfieCapture,
} from './cafe-login-selfie';

describe('decodeCafeLoginSelfieDataUrl', () => {
  it('rejects missing or invalid data URLs', () => {
    expect(decodeCafeLoginSelfieDataUrl('')).toBeNull();
    expect(decodeCafeLoginSelfieDataUrl('not-an-image')).toBeNull();
  });

  it('accepts a JPEG data URL above minimum size', () => {
    const payload = 'A'.repeat(CAFE_LOGIN_SELFIE_MIN_BYTES);
    const dataUrl = `data:image/jpeg;base64,${Buffer.from(payload).toString('base64')}`;
    const decoded = decodeCafeLoginSelfieDataUrl(dataUrl);
    expect(decoded?.contentType).toBe('image/jpeg');
    expect(decoded?.extension).toBe('jpg');
    expect(decoded?.buffer.length).toBeGreaterThanOrEqual(CAFE_LOGIN_SELFIE_MIN_BYTES);
  });
});

describe('validateCafeLoginSelfieCapture', () => {
  it('returns actionable errors for invalid captures', () => {
    expect(validateCafeLoginSelfieCapture('').ok).toBe(false);
    expect(validateCafeLoginSelfieCapture('not-an-image').error).toMatch(/could not be read/i);
  });

  it('accepts a valid JPEG data URL', () => {
    const payload = 'A'.repeat(CAFE_LOGIN_SELFIE_MIN_BYTES);
    const dataUrl = `data:image/jpeg;base64,${Buffer.from(payload).toString('base64')}`;
    const result = validateCafeLoginSelfieCapture(dataUrl);
    expect(result.ok).toBe(true);
  });
});
