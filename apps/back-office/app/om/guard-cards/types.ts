import type { GuardRatingRow } from './lib/rating';

export type GuardCardDisplay = GuardRatingRow & {
  employeeId: string;
  fullName: string;
  rank: string | null;
  idPhotoUrl: string | null;
  isBlacklisted: boolean;
};

export type BlacklistedGuardEntry = {
  id: string;
  employeeId: string;
  empNumber: string;
  guardName: string | null;
  guardRank: string | null;
  reason: string | null;
  blacklistedByName: string;
  blacklistedAt: string;
};

/** @deprecated Use BlacklistedGuardEntry */
export type BlacklistVaultEntry = BlacklistedGuardEntry;
