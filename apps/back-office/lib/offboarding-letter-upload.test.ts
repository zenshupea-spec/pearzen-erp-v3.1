import { describe, expect, it } from 'vitest';

import {
  buildOffboardingLetterStoragePath,
  decodeOffboardingLetterDocRef,
  encodeOffboardingLetterDocRef,
  isOffboardingLetterIndex,
} from './offboarding-letter-upload';

describe('offboarding-letter-upload', () => {
  it('encodes and decodes storage refs', () => {
    const path = 'co-123/offboarding-letters/emp-456/letter-2.pdf';
    const encoded = encodeOffboardingLetterDocRef(path);
    expect(encoded.startsWith('hr-doc:')).toBe(true);
    expect(decodeOffboardingLetterDocRef(encoded)).toBe(path);
  });

  it('extracts storage path from legacy public URLs', () => {
    expect(
      decodeOffboardingLetterDocRef(
        'https://example.supabase.co/storage/v1/object/public/employee-hr-documents/co/letter-1.pdf',
      ),
    ).toBe('co/letter-1.pdf');
  });

  it('builds company-scoped storage paths per letter index', () => {
    expect(
      buildOffboardingLetterStoragePath(
        'co-123',
        'emp-456',
        2,
        'pdf',
      ),
    ).toBe('co-123/offboarding-letters/emp-456/letter-2.pdf');
  });

  it('normalizes file extensions', () => {
    expect(
      buildOffboardingLetterStoragePath('co', 'emp', 1, '.JPG'),
    ).toBe('co/offboarding-letters/emp/letter-1.jpg');
  });

  it('validates letter index', () => {
    expect(isOffboardingLetterIndex(1)).toBe(true);
    expect(isOffboardingLetterIndex(3)).toBe(true);
    expect(isOffboardingLetterIndex(0)).toBe(false);
    expect(isOffboardingLetterIndex(4)).toBe(false);
  });
});
