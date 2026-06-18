/** Minimum NIC length before prior-record lookup runs (supports short dev/test IDs). */
export const MIN_NIC_LOOKUP_LENGTH = 3;

export function normalizeNic(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

export function isNicLookupReady(value: unknown): boolean {
  return normalizeNic(value).length >= MIN_NIC_LOOKUP_LENGTH;
}

/** True when two NIC values refer to the same person (old 9-digit + optional V/X, or new 12-digit). */
export function nicRecordsMatch(stored: unknown, input: unknown): boolean {
  const storedNorm = normalizeNic(stored);
  const inputNorm = normalizeNic(input);
  if (!storedNorm || !inputNorm) return false;
  if (storedNorm === inputNorm) return true;

  const oldStored = storedNorm.match(/^(\d{9})([VX])?$/);
  const oldInput = inputNorm.match(/^(\d{9})([VX])?$/);
  if (oldStored && oldInput) return oldStored[1] === oldInput[1];

  return false;
}
