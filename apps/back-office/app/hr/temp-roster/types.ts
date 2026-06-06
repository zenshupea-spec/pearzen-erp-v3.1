export type TempGuardStatus = 'ACTIVE' | 'ARCHIVED' | 'MERGED';

export type TempShiftEntry = {
  site: string;
  shifts: number;
};

export type TempGuard = {
  id: string;
  sequence: number;
  smId: string;
  fieldIdentity: string;
  status: TempGuardStatus;
  activeFrom: string;
  activeTo: string | null;
  shiftHistory: TempShiftEntry[];
  accruedPay: number;
  mergedToEmpId?: string;
  mergedToName?: string;
  archivedAt?: string;
};

export type SectorManagerRoster = {
  smId: string;
  name: string;
  sector: string;
};
