'use client';

import { ArInvoicingLedger } from '../../../components/ar-invoicing/ArInvoicingLedger';
import {
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageLiveSubtitle,
  ExecutivePageShell,
} from '../../../components/executive/ExecutivePageChrome';

export default function ExecutiveInvoicesPage() {
  return (
    <ExecutivePageShell>
      <ExecutivePageHeader
        title="AR Approval Desk"
        subtitle={
          <ExecutivePageLiveSubtitle>
            MD · Verify payment proof · credit notes issued by Exec Admin · approve status
          </ExecutivePageLiveSubtitle>
        }
      />
      <ExecutivePageBody spacing="relaxed">
        <ArInvoicingLedger variant="md" hideChromeHeader />
      </ExecutivePageBody>
    </ExecutivePageShell>
  );
}
