'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { getCompanyLogoUrl } from '../../../../packages/supabase/company-branding';
import {
  getMdInvoiceConfig,
  type MdInvoiceConfig,
} from '../executive/settings/actions';
import type { SupplierInvoiceProfile } from '../../lib/invoice-desk/types';
import { DEFAULT_SUPPLIER_PROFILE } from '../../lib/invoice-desk/types';

export type InvoiceDeskSettings = MdInvoiceConfig & {
  supplier: SupplierInvoiceProfile;
};

export type InvoiceDeskTaxRates = Pick<
  InvoiceDeskSettings,
  'vatRate' | 'ssclRate' | 'tradingName' | 'companyLogoUrl'
>;

function mdConfigToSupplier(cfg: MdInvoiceConfig): SupplierInvoiceProfile {
  return {
    tradingName: cfg.tradingName || DEFAULT_SUPPLIER_PROFILE.tradingName,
    headOffice: cfg.headOffice,
    telephone: cfg.telephone,
    email: cfg.email,
    pvNumber: cfg.pvNumber,
    supplierTin: cfg.supplierTin,
    supplierAddress: cfg.supplierAddress,
  };
}

/** Full invoice config from md_settings — VAT, SSCL, letterhead, logo. */
export async function getInvoiceDeskSettings(): Promise<InvoiceDeskSettings> {
  noStore();
  const [cfg, companyLogoUrl] = await Promise.all([
    getMdInvoiceConfig(),
    getCompanyLogoUrl(),
  ]);
  return {
    ...cfg,
    companyLogoUrl,
    supplier: mdConfigToSupplier(cfg),
  };
}

/** Same logo source as guard portal / executive sidebar (MD Settings upload). */
export async function fetchInvoiceCompanyLogo() {
  noStore();
  const url = await getCompanyLogoUrl();
  return { url };
}

/** @deprecated Use getInvoiceDeskSettings */
export async function getInvoiceDeskTaxRates(): Promise<InvoiceDeskTaxRates> {
  const cfg = await getInvoiceDeskSettings();
  return {
    vatRate: cfg.vatRate,
    ssclRate: cfg.ssclRate,
    tradingName: cfg.tradingName,
    companyLogoUrl: cfg.companyLogoUrl,
  };
}
