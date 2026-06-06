/** Purchaser (client) details shown on tax invoices */
export interface InvoiceBillingClient {
  clientId: string;
  clientName: string;
  /** Branch / site label (legacy sector field) */
  sector: string;
  address: string;
  purchaserTin: string;
  invoiceContactName: string;
  invoiceContactPhone: string;
}

/** Supplier (Classic Venture) letterhead — editable on Invoice Desk */
export interface SupplierInvoiceProfile {
  tradingName: string;
  headOffice: string;
  telephone: string;
  email: string;
  pvNumber: string;
  supplierTin: string;
  supplierAddress: string;
}

export const DEFAULT_SUPPLIER_PROFILE: SupplierInvoiceProfile = {
  tradingName: 'Classic Venture Security (Pvt) Ltd',
  headOffice: 'No: 196, Park Road, Colombo 05.',
  telephone: '011 263 2000, 0753 632 007',
  email: 'iresha@classicventure.com',
  pvNumber: '7278',
  supplierTin: '114453099-7000',
  supplierAddress: 'No. 196, Park Road, Colombo 05.',
};

export const INVOICE_DESK_CLIENTS_KEY = 'pearzen:invoice-desk-clients-v1';
export const INVOICE_DESK_SUPPLIER_KEY = 'pearzen:invoice-desk-supplier-v1';
export const TAX_INVOICE_SEQ_KEY = 'pearzen:tax-invoice-seq-v1';
