export type DeductionEntryStatus = 'DRAFT' | 'APPROVED';

export type MealSupplierStatus = 'ACTIVE' | 'ARCHIVED';

export type SiteEmployeeDeductionRow = {
  employeeId: string;
  empNumber: string;
  fullName: string;
  rank: string | null;
  /** Duties recorded at this site in the payroll month (deduped across SM roster + time engine). */
  shiftCount: number;
  /** Meals cost this payroll month across all sites (shifts × site food allowance). */
  monthMealCostLkr: number;
  entryId: string | null;
  uniformAmountLkr: number;
  mealsAmountLkr: number;
  /** True when uniform amount came from portal/stock issues, not yet saved on the monthly entry. */
  uniformFromIssue?: boolean;
  /** True when meals amount came from computed shift totals, not yet saved on the monthly entry. */
  mealsFromShifts?: boolean;
  status: DeductionEntryStatus | null;
};

export type SiteDeductionGroup = {
  siteKey: string;
  siteName: string;
  siteProfileId: string | null;
  mealSupplierName: string | null;
  employees: SiteEmployeeDeductionRow[];
  pendingCount: number;
};

export type MealSupplierRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  bankName: string | null;
  bankBranch: string | null;
  accountName: string | null;
  accountNumber: string | null;
  status: MealSupplierStatus;
  archivedAt: string | null;
};

export type MealSupplierMonthOwed = {
  payrollMonth: string;
  payrollMonthLabel: string;
  totalMealsLkr: number;
  guardCount: number;
};

export type SiteMealAssignmentRow = {
  siteProfileId: string;
  siteName: string;
  address: string | null;
  mealSupplierId: string | null;
  mealSupplierName: string | null;
  assignmentId: string | null;
};

export type UniformSupplierRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankBranch: string | null;
  accountName: string | null;
  accountNumber: string | null;
  status: MealSupplierStatus;
  archivedAt: string | null;
};

export type UniformStockItemRow = {
  id: string;
  itemName: string;
  sku: string | null;
  quantityInStock: number;
  unitCostLkr: number | null;
  notes: string | null;
  supplierId: string;
  supplierName: string;
  supplierPhone: string | null;
  supplierAddress: string | null;
  lowStock: boolean;
};

export type UniformStockOverview = {
  items: UniformStockItemRow[];
  suppliers: UniformSupplierRow[];
  activeEmployeeCount: number;
  reorderMinQty: number;
  isDemo: boolean;
};

export type UniformCourierItem = { item: string; qty: number };

export type UniformCourierQueueRow = {
  id: string;
  requestedAt: string;
  issuerEpf: string;
  portal: 'SM' | 'TM' | 'OM' | 'HQ' | 'Unknown';
  guardEpf: string;
  guardName: string | null;
  items: UniformCourierItem[];
  totalAmountLkr: number | null;
  notes: string | null;
  consentSelfieUrl: string | null;
  status: 'PENDING' | 'DISPATCHED';
  dispatchedAt: string | null;
  courierDispatchNotes: string | null;
};

export type UniformCourierQueueOverview = {
  pending: UniformCourierQueueRow[];
  dispatched: UniformCourierQueueRow[];
  isDemo: boolean;
};

export type UniformVoHolderRole = 'SM' | 'TM' | 'OM';

export type UniformVoHolderOption = {
  epf: string;
  fullName: string;
  role: UniformVoHolderRole;
  detail: string | null;
};

export type UniformVoStockRow = {
  itemName: string;
  quantityOnHand: number;
};
