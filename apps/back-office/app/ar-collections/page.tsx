'use client';

import { ArInvoicingLedger } from '../../components/ar-invoicing/ArInvoicingLedger';

/** Executive Admin: dispute holds, payment logging, proof submission → MD approval */
export default function ArCollectionsPage() {
  return <ArInvoicingLedger variant="exec-admin" />;
}
