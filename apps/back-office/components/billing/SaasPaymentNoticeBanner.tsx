'use client';

import { useEffect, useState } from 'react';

import { fetchPendingSaasPayment } from '../../app/forge/billing/actions';
import {
  formatLkr,
  isInvoiceOverdue,
  paymentNoticeLabel,
} from '../../lib/saas-billing';

export default function SaasPaymentNoticeBanner() {
  const [notice, setNotice] = useState<{
    dueDate: string;
    totalLkr: number;
    label: string;
    overdue: boolean;
  } | null>(null);

  useEffect(() => {
    fetchPendingSaasPayment().then((result) => {
      if (result.success && result.pending) {
        setNotice({
          dueDate: result.pending.dueDate,
          totalLkr: result.pending.totalLkr,
          label: paymentNoticeLabel(result.pending.dueDate),
          overdue: isInvoiceOverdue(result.pending.dueDate),
        });
      } else {
        setNotice(null);
      }
    });
  }, []);

  if (!notice) return null;

  return (
    <div
      role="status"
      className={`sticky top-0 z-[100] border-b px-4 py-2.5 text-sm shadow-sm ${
        notice.overdue
          ? 'border-rose-300 bg-rose-100 text-rose-950'
          : 'border-amber-300 bg-amber-100 text-amber-950'
      }`}
    >
      <p className="mx-auto max-w-7xl font-bold">
        Pearzen.tech platform — {notice.label}
      </p>
      <p className={`mx-auto mt-0.5 max-w-7xl ${notice.overdue ? 'text-rose-900' : 'text-amber-900'}`}>
        Due {notice.dueDate} · {formatLkr(notice.totalLkr)}. Open Pearzen.tech payment to upload receipt.
      </p>
    </div>
  );
}
