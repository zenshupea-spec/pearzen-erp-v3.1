/** SaaS Forge commerce — product catalog, purchases, invoices (not ERP subscription billing). */

export type ForgeBillingModel = 'one_time' | 'monthly' | 'milestone';

export type ForgeProductCatalogItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billingModel: ForgeBillingModel;
  basePriceLkr: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export type ForgePurchaseStatus = 'pending' | 'active' | 'cancelled' | 'completed';

export type ForgeBillingInterval = 'once' | 'monthly' | 'yearly';

export type ForgeProductPurchase = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  billingModel: ForgeBillingModel;
  companyId: string | null;
  companyName: string | null;
  buyerName: string;
  buyerEmail: string;
  status: ForgePurchaseStatus;
  priceLkr: number;
  billingInterval: ForgeBillingInterval | null;
  startedAt: string | null;
  contactThreadId: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ForgeProductInvoiceStatus = 'draft' | 'sent' | 'unpaid' | 'paid' | 'void';

export type ForgeProductInvoice = {
  id: string;
  purchaseId: string;
  productName: string;
  buyerName: string;
  buyerEmail: string;
  contactThreadId: string | null;
  invoiceMonth: string | null;
  dueDate: string;
  amountLkr: number;
  status: ForgeProductInvoiceStatus;
  sentAt: string | null;
  paidAt: string | null;
  resendMessageId: string | null;
  createdAt: string;
};

export type ForgeProjectMilestoneStatus = 'pending' | 'invoiced' | 'paid' | 'skipped';

export type ForgeProjectMilestone = {
  id: string;
  purchaseId: string;
  title: string;
  description: string | null;
  amountLkr: number;
  dueDate: string | null;
  sortOrder: number;
  status: ForgeProjectMilestoneStatus;
  invoiceId: string | null;
  invoicedAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export function milestoneStatusLabel(status: ForgeProjectMilestoneStatus): string {
  return status;
}

export function billingIntervalForModel(model: ForgeBillingModel): ForgeBillingInterval {
  if (model === 'monthly') return 'monthly';
  return 'once';
}

export function billingModelLabel(model: ForgeBillingModel): string {
  switch (model) {
    case 'one_time':
      return 'One-time';
    case 'monthly':
      return 'Monthly';
    case 'milestone':
      return 'Milestone';
    default:
      return model;
  }
}

export function purchaseStatusLabel(status: ForgePurchaseStatus): string {
  return status.replace('_', ' ');
}

export function invoiceStatusLabel(status: ForgeProductInvoiceStatus): string {
  return status;
}

export function dueDateInDays(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function invoiceMonthForDate(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}
