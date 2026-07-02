import type { SectorManagerOption } from '../app/actions/site-directory-actions';

/** Sector label for a client site — derived from assigned SM's MNR `employees.site`. */
export function resolveSiteSectorFromSm(
  siteSector: string,
  smEpf: string | null | undefined,
  sectorManagers: SectorManagerOption[],
): string {
  const epf = smEpf?.trim().toUpperCase();
  if (epf) {
    const sm = sectorManagers.find((m) => m.epf.toUpperCase() === epf);
    if (sm?.sector?.trim()) return sm.sector.trim();
  }
  return siteSector.trim() || 'Unassigned';
}
