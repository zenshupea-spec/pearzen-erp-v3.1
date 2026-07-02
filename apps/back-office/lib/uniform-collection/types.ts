export type UniformCollectionItemLine = {
  item: string;
  qty: number;
  unitAmountLkr?: number;
};

export type UniformCollectionCaseStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export type UniformCollectionCaseRow = {
  id: string;
  companyId: string;
  employeeId: string;
  guardEpf: string;
  status: UniformCollectionCaseStatus;
  issuedItems: UniformCollectionItemLine[];
  returnedItems: UniformCollectionItemLine[];
  adminNotes: string | null;
  requestedAt: string;
  requestedBy: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UniformIssuedSummary = {
  lines: UniformCollectionItemLine[];
  totalIssuedLines: number;
  totalQty: number;
  totalAmountLkr: number;
  byItem: Record<string, number>;
};

export type UniformReturnMergeResult = {
  allReturned: boolean;
  shortfallLines: UniformCollectionItemLine[];
};
