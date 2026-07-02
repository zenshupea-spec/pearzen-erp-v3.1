export type SalonAppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export type SalonPaymentMethod = 'cash' | 'card' | 'transfer';

export type SalonServiceRow = {
  id: string;
  companyId: string;
  name: string;
  durationMinutes: number;
  priceLkr: number;
  isActive: boolean;
  sortOrder: number;
};

export type SalonProductRow = {
  id: string;
  companyId: string;
  name: string;
  sku: string | null;
  unitPriceLkr: number;
  stockOnHand: number;
  isActive: boolean;
};

export type SalonAppointmentRow = {
  id: string;
  companyId: string;
  serviceId: string | null;
  serviceName: string | null;
  clientName: string;
  clientPhone: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: SalonAppointmentStatus;
  notes: string | null;
};

export type SalonPosLineItem = {
  kind: 'service' | 'product';
  itemId: string;
  name: string;
  quantity: number;
  unitPriceLkr: number;
  lineTotalLkr: number;
};

export type SalonPosTransactionRow = {
  id: string;
  companyId: string;
  receiptNumber: string;
  totalLkr: number;
  paymentMethod: SalonPaymentMethod;
  lineItems: SalonPosLineItem[];
  notes: string | null;
  createdByEmail: string | null;
  createdAt: string;
};

export type SalonDeskSummary = {
  serviceCount: number;
  productCount: number;
  upcomingAppointments: number;
  todayPosTotalLkr: number;
};
