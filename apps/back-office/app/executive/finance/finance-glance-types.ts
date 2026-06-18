export type CafeBranchGlance = {
  id: string;
  name: string;
  mtdSales: number;
  staffCount: number;
  laborCostMtd: number;
  wastageMtd: number;
  expiringSoon: number;
  lowStock: number;
  overdueTasks: number;
  flaggedVoids: number;
};

export type CafePortfolioGlance = {
  branches: CafeBranchGlance[];
  totals: {
    mtdSales: number;
    laborCostMtd: number;
    wastageMtd: number;
    stockAlerts: number;
    complianceAlerts: number;
    staffCount: number;
  };
  error?: string;
};

export type ShalomPropertyGlance = {
  id: string;
  name: string;
  occupancyPct: number;
  occupancyTarget: number;
  paidRevenue: number;
  pendingRevenue: number;
  bookedNights: number;
};

export type ShalomHostGlance = {
  properties: ShalomPropertyGlance[];
  totalPaidRevenue: number;
  totalPendingRevenue: number;
  portfolioOccupancyPct: number;
  totalBookedNights: number;
  daysInMonth: number;
  checkInsToday: number;
  checkInsNext7d: number;
  unenrichedBookings: number;
  tableReady: boolean;
  error?: string;
};
