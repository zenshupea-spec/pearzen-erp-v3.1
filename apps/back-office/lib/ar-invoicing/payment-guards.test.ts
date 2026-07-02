import { describe, expect, it } from 'vitest';
import {
  arLedgerActorRole,
  collectPaymentStatusChanges,
  proofRefFromProofUrl,
  validatePaymentStatusTransition,
} from './payment-guards';
import type { ArLedgerClientRecord } from './live-ledger';

function cell(status: string, extras: Record<string, unknown> = {}) {
  return {
    status,
    invoiceNo: 'INV-2605-001',
    totalAmount: 100_000,
    rankLines: [],
    patrols: [],
    ...extras,
  };
}

function client(id: string, invoices: Record<string, ReturnType<typeof cell>>): ArLedgerClientRecord {
  return { clientId: id, clientName: id, sector: 'Test', invoices };
}

describe('payment-guards', () => {
  it('detects payment status changes between snapshots', () => {
    const before = [client('c1', { '2026-05': cell('PENDING') })];
    const after = [
      client('c1', {
        '2026-05': cell('PENDING_MD_VERIFICATION', { pendingVerificationProof: 'data:x' }),
      }),
    ];
    const changes = collectPaymentStatusChanges(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.toStatus).toBe('PENDING_MD_VERIFICATION');
  });

  it('blocks maker from posting PAID', () => {
    const change = {
      clientId: 'c1',
      clientName: 'c1',
      monthKey: '2026-05',
      fromStatus: 'PENDING',
      toStatus: 'PAID',
      before: cell('PENDING'),
      after: cell('PAID', { paymentProof: 'data:x' }),
    };
    const result = validatePaymentStatusTransition('maker', change);
    expect(result.ok).toBe(false);
  });

  it('blocks checker from skipping verification queue', () => {
    const change = {
      clientId: 'c1',
      clientName: 'c1',
      monthKey: '2026-05',
      fromStatus: 'PENDING',
      toStatus: 'PAID',
      before: cell('PENDING'),
      after: cell('PAID', { paymentProof: 'data:x' }),
    };
    const result = validatePaymentStatusTransition('checker', change);
    expect(result.ok).toBe(false);
  });

  it('allows checker to verify queued proof', () => {
    const change = {
      clientId: 'c1',
      clientName: 'c1',
      monthKey: '2026-05',
      fromStatus: 'PENDING_MD_VERIFICATION',
      toStatus: 'PAID',
      before: cell('PENDING_MD_VERIFICATION', { pendingVerificationProof: 'data:abc' }),
      after: cell('PAID', { paymentProof: 'data:abc' }),
    };
    const result = validatePaymentStatusTransition('checker', change);
    expect(result.ok).toBe(true);
  });

  it('hashes inline proof blobs', () => {
    const ref = proofRefFromProofUrl('data:image/png;base64,abcd');
    expect(ref).toMatch(/^sha256:/);
  });

  it('classifies FM as maker and MD as checker', () => {
    expect(arLedgerActorRole('FM')).toBe('maker');
    expect(arLedgerActorRole('MD')).toBe('checker');
  });
});
