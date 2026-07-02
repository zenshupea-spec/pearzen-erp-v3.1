export type RetailCartStatus = 'open' | 'checked_out' | 'abandoned';

export type RetailOrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled';

export type RetailPaymentMethod = 'cash' | 'card' | 'transfer';

export type RetailCartLineItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceLkr: number;
  lineTotalLkr: number;
};

export type RetailProductRow = {
  id: string;
  companyId: string;
  name: string;
  sku: string | null;
  unitPriceLkr: number;
  isActive: boolean;
  published: boolean;
  stockOnHand: number;
  reorderLevel: number;
};

export type RetailCartRow = {
  id: string;
  companyId: string;
  cartCode: string;
  status: RetailCartStatus;
  lineItems: RetailCartLineItem[];
  notes: string | null;
  updatedAt: string;
};

export type RetailOrderLineRow = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPriceLkr: number;
  lineTotalLkr: number;
};

export type RetailOrderRow = {
  id: string;
  companyId: string;
  orderNumber: string;
  status: RetailOrderStatus;
  totalLkr: number;
  paymentMethod: RetailPaymentMethod;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  createdAt: string;
  lines: RetailOrderLineRow[];
};

export type RetailDeskSummary = {
  productCount: number;
  lowStockCount: number;
  openCarts: number;
  todayOrderTotalLkr: number;
};
