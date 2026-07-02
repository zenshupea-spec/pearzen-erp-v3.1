import { createHash } from 'crypto';

import { canAccessArCollections } from '../ar-collections-access';
import { normalizePortalRole } from '../portal-role-utils';

export { canAccessArCollections };
import type { ArInvoiceCell, ArLedgerClientRecord } from './live-ledger';

export type ArPaymentStatus =
  | 'PAID'
  | 'PENDING'
  | 'PARTIAL'
  | 'NONE'
  | 'PENDING_MD_VERIFICATION'
  | 'DISPUTED'
  | 'SETTLED_FINED';

export type PaymentStatusChange = {
  clientId: string;
  clientName: string;
  monthKey: string;
  fromStatus: string;
  toStatus: string;
  before: ArInvoiceCell;
  after: ArInvoiceCell;
};

export type ArLedgerActorRole = 'maker' | 'checker' | 'other';

const MD_VERIFY_STATUSES = new Set<ArPaymentStatus>(['PAID', 'PARTIAL', 'SETTLED_FINED']);

export function arLedgerActorRole(role: string | null | undefined): ArLedgerActorRole {
  const normalized = normalizePortalRole(role);
  if (normalized === 'MD' || normalized === 'OD') return 'checker';
  if (normalized === 'FM' || normalized === 'HR' || normalized === 'EA') return 'maker';
  return 'other';
}

export function proofRefFromProofUrl(proofUrl: string | undefined | null): string | null {
  if (!proofUrl) return null;
  if (proofUrl.startsWith('data:')) {
    const payload = proofUrl.slice(proofUrl.indexOf(',') + 1);
    const digest = createHash('sha256').update(payload).digest('hex');
    return `sha256:${digest.slice(0, 32)}`;
  }
  if (proofUrl.startsWith('http://') || proofUrl.startsWith('https://')) return proofUrl;
  return `inline:${proofUrl.slice(0, 48)}`;
}

function cellHasProof(cell: ArInvoiceCell, fallback?: ArInvoiceCell): boolean {
  return Boolean(
    cell.pendingVerificationProof ||
      cell.paymentProof ||
      fallback?.pendingVerificationProof ||
      fallback?.paymentProof,
  );
}

export function collectPaymentStatusChanges(
  beforeClients: ArLedgerClientRecord[],
  afterClients: ArLedgerClientRecord[],
): PaymentStatusChange[] {
  const beforeById = new Map(beforeClients.map((client) => [client.clientId, client]));
  const changes: PaymentStatusChange[] = [];

  for (const afterClient of afterClients) {
    const beforeClient = beforeById.get(afterClient.clientId);
    const monthKeys = new Set([
      ...Object.keys(beforeClient?.invoices ?? {}),
      ...Object.keys(afterClient.invoices ?? {}),
    ]);

    for (const monthKey of monthKeys) {
      const before = beforeClient?.invoices?.[monthKey];
      const after = afterClient.invoices?.[monthKey];
      if (!before || !after) continue;
      const fromStatus = String(before.status ?? 'NONE');
      const toStatus = String(after.status ?? 'NONE');
      if (fromStatus === toStatus) continue;
      changes.push({
        clientId: afterClient.clientId,
        clientName: afterClient.clientName,
        monthKey,
        fromStatus,
        toStatus,
        before,
        after,
      });
    }
  }

  return changes;
}

export function validatePaymentStatusTransition(
  actorRole: ArLedgerActorRole,
  change: PaymentStatusChange,
): { ok: true } | { ok: false; error: string } {
  const { fromStatus, toStatus, after, before } = change;

  if (actorRole === 'maker') {
    if (MD_VERIFY_STATUSES.has(toStatus as ArPaymentStatus)) {
      return { ok: false, error: 'Only MD/OD can verify payments.' };
    }
    if (toStatus === 'PENDING_MD_VERIFICATION') {
      if (fromStatus !== 'PENDING' && fromStatus !== 'DISPUTED') {
        return {
          ok: false,
          error: 'Payment proof can only be submitted from Pending or Disputed status.',
        };
      }
      if (!after.pendingVerificationProof) {
        return { ok: false, error: 'Payment proof is required before MD verification.' };
      }
      return { ok: true };
    }
    if (toStatus === 'DISPUTED' && fromStatus === 'PENDING') return { ok: true };
    if (toStatus === 'PENDING' && fromStatus === 'DISPUTED') return { ok: true };
    return { ok: true };
  }

  if (actorRole === 'checker') {
    if (MD_VERIFY_STATUSES.has(toStatus as ArPaymentStatus)) {
      if (fromStatus !== 'PENDING_MD_VERIFICATION') {
        return { ok: false, error: 'Payment must be queued for MD verification before approval.' };
      }
      if (!cellHasProof(after, before)) {
        return { ok: false, error: 'Payment proof is required for MD verification.' };
      }
      return { ok: true };
    }
    if (toStatus === 'PENDING_MD_VERIFICATION') {
      return { ok: false, error: 'MD cannot submit desk payment proof.' };
    }
    if (
      toStatus === 'PENDING' &&
      (fromStatus === 'PAID' ||
        fromStatus === 'PARTIAL' ||
        fromStatus === 'SETTLED_FINED' ||
        fromStatus === 'PENDING_MD_VERIFICATION')
    ) {
      return { ok: true };
    }
    return { ok: true };
  }

  if (fromStatus !== toStatus) {
    return { ok: false, error: 'You are not allowed to change invoice payment status.' };
  }

  return { ok: true };
}

export function paymentVerifyAuditAction(
  status: string,
): 'PAYMENT_VERIFIED_PAID' | 'PAYMENT_PARTIAL' | 'PAYMENT_SETTLED_FINED' | null {
  switch (status) {
    case 'PAID':
      return 'PAYMENT_VERIFIED_PAID';
    case 'PARTIAL':
      return 'PAYMENT_PARTIAL';
    case 'SETTLED_FINED':
      return 'PAYMENT_SETTLED_FINED';
    default:
      return null;
  }
}

export function stampPaymentAuditActors(
  clients: ArLedgerClientRecord[],
  changes: PaymentStatusChange[],
  actorLabel: string,
): ArLedgerClientRecord[] {
  if (changes.length === 0) return clients;

  const verifyKeys = new Set(
    changes
      .filter((change) => paymentVerifyAuditAction(change.toStatus))
      .map((change) => `${change.clientId}:${change.monthKey}`),
  );
  const proofKeys = new Set(
    changes
      .filter((change) => change.toStatus === 'PENDING_MD_VERIFICATION')
      .map((change) => `${change.clientId}:${change.monthKey}`),
  );

  return clients.map((client) => {
    let invoices = client.invoices;
    for (const [monthKey, cell] of Object.entries(client.invoices ?? {})) {
      const key = `${client.clientId}:${monthKey}`;
      if (!verifyKeys.has(key) && !proofKeys.has(key)) continue;
      const events = [...(cell.auditEvents ?? [])];
      if (events.length === 0) continue;
      const last = events[events.length - 1] as Record<string, unknown>;
      events[events.length - 1] = { ...last, actor: actorLabel };
      invoices = { ...invoices, [monthKey]: { ...cell, auditEvents: events } };
    }
    return invoices === client.invoices ? client : { ...client, invoices };
  });
}
