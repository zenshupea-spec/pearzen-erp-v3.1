import {
  sumClientDeductions,
  type ArCollectionCell,
} from '../../../lib/ar-invoicing/collection-math';

export type FmClientBillingCollection = {
  paidDate: string;
  paidAmount: number;
  clientDeductions: number;
};

export type FmSiteBillingInput = {
  id: string;
  name: string;
  clientBilled: number;
};

export type FmSiteBillingMeta = {
  client_name?: string | null;
  parent_client?: string | null;
};

export type FmArLedgerClientRef = {
  clientName: string;
  invoices: Record<string, ArCollectionCell & { paidDate?: string }>;
};

const EMPTY_COLLECTION: FmClientBillingCollection = {
  paidDate: '—',
  paidAmount: 0,
  clientDeductions: 0,
};

function billingClientKeyForSite(
  site: FmSiteBillingInput,
  meta: FmSiteBillingMeta | undefined,
): string {
  return (meta?.parent_client?.trim() || meta?.client_name?.trim() || site.name).trim();
}

function collectionPaidAmount(cell: ArCollectionCell): number {
  if (cell.status === 'PAID') {
    return Number(cell.amountReceived ?? cell.totalAmount ?? 0);
  }
  if (cell.status === 'PARTIAL' || cell.status === 'SETTLED_FINED') {
    return Number(cell.amountReceived ?? 0);
  }
  return 0;
}

function billingClientKeyForSiteRow(
  site: FmSiteBillingInput,
  meta: FmSiteBillingMeta | undefined,
): string {
  return billingClientKeyForSite(site, meta);
}

/** Map Invoice Desk collection cells to FM portfolio site rows (pro-rata when sites share a client). */
export function mapArCollectionsToSites(
  sites: FmSiteBillingInput[],
  clients: FmArLedgerClientRef[],
  monthKey: string,
  siteMetaById: Record<string, FmSiteBillingMeta>,
): Record<string, FmClientBillingCollection> {
  const clientsByName = new Map(clients.map((client) => [client.clientName, client]));
  const sitesByClient = new Map<string, FmSiteBillingInput[]>();

  for (const site of sites) {
    const clientKey = billingClientKeyForSiteRow(site, siteMetaById[site.id]);
    const list = sitesByClient.get(clientKey) ?? [];
    list.push(site);
    sitesByClient.set(clientKey, list);
  }

  const result: Record<string, FmClientBillingCollection> = {};

  for (const [clientKey, clientSites] of sitesByClient) {
    const cell = clientsByName.get(clientKey)?.invoices[monthKey];
    if (!cell || cell.status === 'NONE') {
      for (const site of clientSites) {
        result[site.id] = EMPTY_COLLECTION;
      }
      continue;
    }

    const totalPaid = collectionPaidAmount(cell);
    const totalDeductions = sumClientDeductions(cell);
    const paidDate = cell.paidDate?.trim() ? cell.paidDate.trim() : '—';
    const totalBilled = clientSites.reduce((sum, site) => sum + site.clientBilled, 0);

    for (const site of clientSites) {
      const ratio =
        totalBilled > 0
          ? site.clientBilled / totalBilled
          : clientSites.length === 1
            ? 1
            : 0;
      result[site.id] = {
        paidDate: ratio > 0 ? paidDate : '—',
        paidAmount: Math.round(totalPaid * ratio),
        clientDeductions: Math.round(totalDeductions * ratio),
      };
    }
  }

  return result;
}
