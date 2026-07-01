import { describe, expect, it } from 'vitest';

import {
  formatStayOpsPhoneForTel,
  normalizeCollectInquiryPhone,
  parseDamageItems,
  parseDamagePresets,
  mapShalomBookingStayOpsFromRow,
  parseShalomStayOpsSettings,
  resolveCollectInquiryPhone,
  resolveHandoverRooms,
  resolveShalomDamagePresets,
  sanitizeShalomDamagePresetsInput,
  sanitizeShalomHandoverRoomsInput,
  SHALOM_DEFAULT_COLLECT_INQUIRY_PHONE,
  stayOpsGrandTotal,
  stayOpsTotalDamages,
} from './shalom-stay-ops';

describe('shalom-stay-ops', () => {
  it('normalizes collect inquiry phone numbers', () => {
    expect(SHALOM_DEFAULT_COLLECT_INQUIRY_PHONE).toBe('+94753632001');
    expect(normalizeCollectInquiryPhone('')).toBe('');
    expect(normalizeCollectInquiryPhone('  +94 75 363 2001 ')).toBe('+94753632001');
    expect(normalizeCollectInquiryPhone('94753632001')).toBe('+94753632001');
    expect(normalizeCollectInquiryPhone('0094753632001')).toBe('+94753632001');
    expect(resolveCollectInquiryPhone('')).toBe('+94753632001');
    expect(formatStayOpsPhoneForTel('')).toBe('tel:+94753632001');
    expect(formatStayOpsPhoneForTel('94753632001')).toBe('tel:+94753632001');
  });

  it('parses stay-ops settings with defaults', () => {
    expect(parseShalomStayOpsSettings(null)).toEqual({
      collectInquiryPhone: '',
      damagePresets: [],
      handoverRooms: [],
    });
    expect(
      parseShalomStayOpsSettings({
        collectInquiryPhone: '94770000000',
        damagePresets: [{ id: 'd1', label: 'Broken glass', amountLkr: 5000 }],
        handoverRooms: [{ id: 'bedroom-1', label: 'Bedroom 1' }],
      }),
    ).toEqual({
      collectInquiryPhone: '+94770000000',
      damagePresets: [{ id: 'd1', label: 'Broken glass', amountLkr: 5000 }],
      handoverRooms: [{ id: 'bedroom-1', label: 'Bedroom 1' }],
    });
  });

  it('parses damage presets and drops invalid rows', () => {
    expect(parseDamagePresets([{ id: 'a', label: 'Stain', amountLkr: 2500 }])).toEqual([
      { id: 'a', label: 'Stain', amountLkr: 2500 },
    ]);
    expect(
      parseDamagePresets([
        { id: '', label: 'Missing id', amountLkr: 100 },
        { id: 'b', label: '', amountLkr: 100 },
        { id: 'c', label: 'Zero', amountLkr: 0 },
      ]),
    ).toEqual([]);
  });

  it('parses recorded damage items', () => {
    expect(
      parseDamageItems([
        {
          id: 'd1',
          label: 'Missing key',
          amountLkr: 1500,
          recordedAt: '2026-07-23T10:00:00.000Z',
          recordedByEpf: 'EPF123',
        },
        { id: 'd2', label: 'Incomplete', amountLkr: 500 },
      ]),
    ).toEqual([
      {
        id: 'd1',
        label: 'Missing key',
        amountLkr: 1500,
        recordedAt: '2026-07-23T10:00:00.000Z',
        recordedByEpf: 'EPF123',
      },
    ]);
  });

  it('maps booking stay-ops fields from db rows', () => {
    expect(
      mapShalomBookingStayOpsFromRow({
        caretaker_collect_lkr: 8500,
        damage_items: [
          {
            id: 'd1',
            label: 'Stain',
            amountLkr: 2000,
            recordedAt: '2026-07-23T10:00:00.000Z',
            recordedByEpf: 'EPF1',
          },
        ],
        guest_id_document_url: 'storage://shalom-guest-ids/a/b/c.jpg',
        invoice_email: 'guest@example.com',
        invoice_sent_at: '2026-07-23T12:00:00.000Z',
        invoice_reference: 'SHL-2026-00001',
        pre_handover_photos: [],
        pre_handover_verified_at: null,
      }),
    ).toEqual({
      caretakerCollectLkr: 8500,
      damages: [
        {
          id: 'd1',
          label: 'Stain',
          amountLkr: 2000,
          recordedAt: '2026-07-23T10:00:00.000Z',
          recordedByEpf: 'EPF1',
        },
      ],
      guestIdDocumentUrl: 'storage://shalom-guest-ids/a/b/c.jpg',
      invoiceEmail: 'guest@example.com',
      invoiceSentAt: '2026-07-23T12:00:00.000Z',
      invoiceReference: 'SHL-2026-00001',
      preHandoverPhotos: [],
      preHandoverVerifiedAt: null,
    });
  });

  it('totals damages and grand collect+damage amount', () => {
    const damages = [
      { amountLkr: 1500 },
      { amountLkr: 2500 },
    ] as const;
    expect(stayOpsTotalDamages(damages)).toBe(4000);
    expect(stayOpsGrandTotal(8500, damages)).toBe(12500);
    expect(stayOpsGrandTotal(null, damages)).toBe(4000);
    expect(stayOpsGrandTotal(0, damages)).toBe(4000);
  });

  it('sanitizes damage preset drafts for save', () => {
    expect(
      sanitizeShalomDamagePresetsInput([
        { id: 'd1', label: 'Broken glass', amountLkr: 5000 },
        { label: 'Stain', amountLkr: 2500 },
      ]),
    ).toEqual({
      ok: true,
      presets: [
        { id: 'd1', label: 'Broken glass', amountLkr: 5000 },
        { id: 'dmg-stain-2', label: 'Stain', amountLkr: 2500 },
      ],
    });
    expect(sanitizeShalomDamagePresetsInput([{ id: 'x', label: '', amountLkr: 100 }])).toEqual({
      ok: false,
      error: 'Each damage type needs a name.',
    });
  });

  it('sanitizes handover room drafts for save', () => {
    expect(
      sanitizeShalomHandoverRoomsInput([
        { id: 'kitchen', label: 'Kitchen' },
        { label: 'Bedroom 1' },
      ]),
    ).toEqual({
      ok: true,
      rooms: [
        { id: 'kitchen', label: 'Kitchen' },
        { id: 'bedroom-1', label: 'Bedroom 1' },
      ],
    });
  });

  it('resolves default handover rooms when property list is empty', () => {
    expect(resolveHandoverRooms([]).length).toBeGreaterThan(0);
    expect(resolveHandoverRooms([{ id: 'pool', label: 'Pool' }])).toEqual([
      { id: 'pool', label: 'Pool' },
    ]);
  });

  it('prefers company replacement catalog over per-property damage presets', () => {
    const stayOps = parseShalomStayOpsSettings({
      damagePresets: [{ id: 'legacy', label: 'Legacy stain', amountLkr: 1000 }],
    });
    expect(
      resolveShalomDamagePresets(stayOps, [{ id: 'tv', item: 'Broken TV', cost: 45000 }]),
    ).toEqual([{ id: 'tv', label: 'Broken TV', amountLkr: 45000 }]);
    expect(resolveShalomDamagePresets(stayOps, [])).toEqual(stayOps.damagePresets);
  });
});
