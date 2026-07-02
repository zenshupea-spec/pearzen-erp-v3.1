export type SettingsSectionId =
  | 'bankExport'
  | 'statutory'
  | 'payGroup'
  | 'guardRetention'
  | 'guardFormulas'
  | 'cafeFormulas'
  | 'crossDeployment'
  | 'entityBranding'
  | 'cafeOtCutoff'
  | 'billingCycle'
  | 'rankPay'
  | 'gratuity'
  | 'welfareFund'
  | 'geofence'
  | 'internalWorkLocations'
  | 'shiftTimes'
  | 'cafeOperatingWindow'
  | 'penaltyCatalog'
  | 'replacementCatalog'
  | 'portalRbac';

export const SETTINGS_SECTION_AUDIT_ACTIONS: Record<SettingsSectionId, string[]> = {
  bankExport: ['UPDATE_BANK_EXPORT_SETTINGS'],
  statutory: ['UPDATE_INVOICE_SETTINGS', 'UPDATE_PAYROLL_STATUTORY_SETTINGS', 'UPDATE_SETTINGS'],
  payGroup: ['UPDATE_ENGINE_CONSTANTS'],
  guardRetention: ['UPDATE_ENGINE_CONSTANTS'],
  guardFormulas: ['UPDATE_PAY_FORMULAS'],
  cafeFormulas: ['UPDATE_PAY_FORMULAS', 'UPDATE_ENGINE_CONSTANTS'],
  crossDeployment: ['UPDATE_ENGINE_CONSTANTS'],
  entityBranding: ['UPDATE_DIVISION_NAMES', 'UPDATE_COMPANY_LOGO'],
  cafeOtCutoff: ['UPDATE_ENGINE_CONSTANTS'],
  billingCycle: ['UPDATE_ENGINE_CONSTANTS'],
  rankPay: ['UPDATE_RANK_PAY_MATRIX', 'UPDATE_RANK_SALARY'],
  gratuity: ['UPDATE_GRATUITY_SETTINGS'],
  welfareFund: ['UPDATE_WELFARE_FUND_SETTINGS'],
  geofence: ['UPDATE_GEOFENCE_SETTINGS'],
  internalWorkLocations: ['UPDATE_INTERNAL_WORK_LOCATIONS'],
  shiftTimes: ['UPDATE_SHIFT_SETTINGS'],
  cafeOperatingWindow: ['UPDATE_ENGINE_CONSTANTS'],
  penaltyCatalog: ['UPDATE_PENALTY_CATALOG'],
  replacementCatalog: ['UPDATE_REPLACEMENT_CATALOG'],
  portalRbac: ['UPDATE_PORTAL_RBAC_MATRIX'],
};
