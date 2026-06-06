import type { ReactNode } from 'react';
import { InvoiceDeskShell } from '../../components/invoice-desk/InvoiceDeskShell';

export default function InvoiceDeskLayout({ children }: { children: ReactNode }) {
  return <InvoiceDeskShell>{children}</InvoiceDeskShell>;
}
