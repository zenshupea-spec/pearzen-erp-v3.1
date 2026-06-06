export type OmRankKey = 'CSO' | 'OIC' | 'SSO' | 'JSO' | 'LSO';

export type OmClearanceState = 'valid' | 'expired';

export type OmAssignableGuard = {
  empNo: string;
  name: string;
  rank: string;
  rankKey: OmRankKey;
  clearance: OmClearanceState;
};

export type OmAllocationSlot = {
  slotId: string;
  rank: OmRankKey;
  shiftType: 'day' | 'night' | 'both';
  label: string;
  currentEmpNo: string | null;
};

export type OmAllocationSite = {
  siteId: string;
  clientName: string;
  siteName: string;
  location: string;
  slots: OmAllocationSlot[];
  changeRequest?: string;
  changeRequestDate?: string;
};

export type OmTacticalShort = {
  shortId: string;
  site: string;
  client: string;
  sector: string;
  required: number;
  deployed: number;
  smName: string;
  shiftTime: string;
  loanerStatus: 'IDLE' | 'SEARCHING' | 'FOUND';
  siteLat: number;
  siteLng: number;
};

export type OmNearbyGuard = {
  guardId: string;
  name: string;
  rank: string;
  contact: string;
  homeAddress: string;
  homeLat: number;
  homeLng: number;
  distanceKm: number;
};

export type OmGuardProfile = {
  empNo: string;
  name: string;
  rank: OmRankKey;
  basicSalary: number;
  unpaidShiftsLastMonth: number;
};

export type OmSiteAllocationPayload = {
  guardPool: OmAssignableGuard[];
  unassignedSites: OmAllocationSite[];
  allocatedSites: OmAllocationSite[];
  tacticalShorts: OmTacticalShort[];
  nearbyGuardBench: Omit<OmNearbyGuard, 'distanceKm'>[];
  guardRoster: OmGuardProfile[];
  isDemo: boolean;
  error?: string;
};
