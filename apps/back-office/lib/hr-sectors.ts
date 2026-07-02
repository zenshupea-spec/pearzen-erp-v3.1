/** Default SM sector names for HR induction / MNR — tenant may append via md_settings. */
export const DEFAULT_HR_SECTOR_NAMES = [
  'COLOMBO 1',
  'COLOMBO 2',
  'COLOMBO 3',
  'KANDY',
  'MATARA',
  'KURUNAGALA',
] as const;

export function normalizeHrSectorName(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function parseHrSectorNamesFromStorage(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeHrSectorName(String(entry ?? '')))
    .filter(Boolean);
}

/** Seed list first, then tenant-added names (case-insensitive dedupe). */
export function mergeHrSectorNames(
  seed: readonly string[],
  saved: readonly string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const name of [...seed, ...saved]) {
    const normalized = normalizeHrSectorName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

/** Active roster row is a Sector Manager (HO+SM rank or legacy SECTOR_MANAGER group). */
export function isSectorManagerEmployee(row: {
  group?: string | null;
  rank?: string | null;
}): boolean {
  const group = String(row.group ?? '').trim().toUpperCase();
  if (group === 'SECTOR_MANAGER' || group === 'SM') return true;
  return String(row.rank ?? '').trim().toUpperCase() === 'SM';
}
