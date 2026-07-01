/** Shalom caretaker stay-ops — collect, damages, guest ID, invoice. */

import type { ReplacementCatalogEntry } from '../../../packages/replacement-catalog';
import { parseCaretakerCollectLkr } from './shalom-calendar';

export const SHALOM_DEFAULT_COLLECT_INQUIRY_PHONE = '+94753632001';
export const SHALOM_MAX_DAMAGE_PRESETS = 20;

export const SHALOM_DAMAGE_PRESET_TEMPLATES: ShalomDamagePreset[] = [
  { id: 'dmg-glass', label: 'Broken glass', amountLkr: 5000 },
  { id: 'dmg-linen', label: 'Stained linen', amountLkr: 2500 },
  { id: 'dmg-key', label: 'Missing key', amountLkr: 3000 },
];

/** @deprecated Use SHALOM_DAMAGE_PRESET_TEMPLATES */
export const SHALOM_DAMAGE_PRESET_EXAMPLES = SHALOM_DAMAGE_PRESET_TEMPLATES;

export const SHALOM_MAX_HANDOVER_ROOMS = 20;
export const SHALOM_HANDOVER_PHOTO_RETENTION_DAYS = 14;

export type ShalomHandoverRoom = { id: string; label: string };

export const SHALOM_DEFAULT_HANDOVER_ROOM_TEMPLATES: ShalomHandoverRoom[] = [
  { id: 'living-room', label: 'Living Room' },
  { id: 'bedroom-1', label: 'Bedroom 1' },
  { id: 'bedroom-2', label: 'Bedroom 2' },
  { id: 'bedroom-3', label: 'Bedroom 3' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'washroom-1', label: 'Washroom 1' },
  { id: 'washroom-2', label: 'Washroom 2' },
  { id: 'washroom-3', label: 'Washroom 3' },
];

/** @deprecated Use resolveHandoverRooms() with property settings. */
export const SHALOM_HANDOVER_ROOMS = SHALOM_DEFAULT_HANDOVER_ROOM_TEMPLATES;

export type ShalomPreHandoverPhoto = {
  id: string;
  label: string;
  photoUrl: string;
  capturedAt: string;
  recordedByEpf?: string;
};

export type ShalomDamagePreset = { id: string; label: string; amountLkr: number };

export type ShalomRecordedDamage = ShalomDamagePreset & {
  recordedAt: string;
  recordedByEpf: string;
  photoUrl?: string | null;
};

export type ShalomDamageRecordEntry = {
  presetId: string;
  photoUrl: string;
};

/** Stored in `shalom_properties.settings` jsonb. */
export type ShalomStayOpsSettings = {
  collectInquiryPhone: string;
  damagePresets: ShalomDamagePreset[];
  handoverRooms: ShalomHandoverRoom[];
};

/** Per-booking stay-ops fields (DB columns added in Step 2). */
export type ShalomBookingStayOps = {
  caretakerCollectLkr: number | null;
  damages: ShalomRecordedDamage[];
  guestIdDocumentUrl: string | null;
  invoiceEmail: string | null;
  invoiceSentAt: string | null;
  invoiceReference: string | null;
  preHandoverPhotos: ShalomPreHandoverPhoto[];
  preHandoverVerifiedAt: string | null;
};

function parsePositiveAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function parseDamagePreset(raw: unknown): ShalomDamagePreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const label = typeof row.label === 'string' ? row.label.trim() : '';
  const amountLkr = parsePositiveAmount(row.amountLkr);
  if (!id || !label || amountLkr == null) return null;
  return { id, label, amountLkr };
}

export function parseDamagePresets(raw: unknown): ShalomDamagePreset[] {
  if (!Array.isArray(raw)) return [];
  const presets: ShalomDamagePreset[] = [];
  for (const item of raw) {
    const preset = parseDamagePreset(item);
    if (preset) presets.push(preset);
  }
  return presets;
}

export function sanitizeShalomDamagePresetsInput(
  raw: unknown,
): { ok: true; presets: ShalomDamagePreset[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Invalid damage list.' };
  if (raw.length > SHALOM_MAX_DAMAGE_PRESETS) {
    return { ok: false, error: `Maximum ${SHALOM_MAX_DAMAGE_PRESETS} damage types.` };
  }

  const presets: ShalomDamagePreset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Each damage type needs a name and amount.' };
    }
    const row = item as Record<string, unknown>;
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const amountLkr = parsePositiveAmount(row.amountLkr);
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `dmg-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'}-${presets.length + 1}`;
    if (!label) return { ok: false, error: 'Each damage type needs a name.' };
    if (amountLkr == null) return { ok: false, error: `"${label}" needs an amount above LKR 0.` };
    presets.push({ id, label, amountLkr });
  }

  return { ok: true, presets };
}

export function normalizeCollectInquiryPhone(input: string): string {
  const compact = input.replace(/[\s()-]/g, '').trim();
  if (!compact) return '';
  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('00')) return `+${compact.slice(2)}`;
  return `+${compact}`;
}

/** Caretaker call target — uses configured phone or platform default when unset. */
export function resolveCollectInquiryPhone(phone: string | null | undefined): string {
  const normalized = normalizeCollectInquiryPhone(phone ?? '');
  return normalized || SHALOM_DEFAULT_COLLECT_INQUIRY_PHONE;
}

export function formatStayOpsPhoneForTel(phone: string): string {
  return `tel:${resolveCollectInquiryPhone(phone)}`;
}

function parseHandoverRoom(raw: unknown): ShalomHandoverRoom | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const label = typeof row.label === 'string' ? row.label.trim() : '';
  if (!id || !label) return null;
  return { id, label };
}

export function parseHandoverRooms(raw: unknown): ShalomHandoverRoom[] {
  if (!Array.isArray(raw)) return [];
  const rooms: ShalomHandoverRoom[] = [];
  for (const item of raw) {
    const room = parseHandoverRoom(item);
    if (room) rooms.push(room);
  }
  return rooms;
}

export function handoverRoomSlug(label: string, index: number): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return base || `room-${index + 1}`;
}

export function sanitizeShalomHandoverRoomsInput(
  raw: unknown,
): { ok: true; rooms: ShalomHandoverRoom[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Invalid room list.' };
  if (raw.length > SHALOM_MAX_HANDOVER_ROOMS) {
    return { ok: false, error: `Maximum ${SHALOM_MAX_HANDOVER_ROOMS} rooms.` };
  }

  const rooms: ShalomHandoverRoom[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Each room needs a name.' };
    }
    const row = item as Record<string, unknown>;
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : handoverRoomSlug(label, rooms.length);
    if (!label) return { ok: false, error: 'Each room needs a name.' };
    if (seenIds.has(id)) return { ok: false, error: `Duplicate room id "${id}".` };
    seenIds.add(id);
    rooms.push({ id, label });
  }

  return { ok: true, rooms };
}

/** Caretaker + MD UI — saved rooms, else starter templates. */
export function resolveHandoverRooms(configured: readonly ShalomHandoverRoom[]): ShalomHandoverRoom[] {
  if (configured.length > 0) return [...configured];
  return SHALOM_DEFAULT_HANDOVER_ROOM_TEMPLATES.map((room) => ({ ...room }));
}

export function sortPreHandoverPhotos(
  photos: ShalomPreHandoverPhoto[],
  rooms: readonly ShalomHandoverRoom[],
): ShalomPreHandoverPhoto[] {
  return [...photos].sort(
    (a, b) =>
      rooms.findIndex((row) => row.id === a.id) - rooms.findIndex((row) => row.id === b.id),
  );
}

export function parseShalomStayOpsSettings(raw: unknown): ShalomStayOpsSettings {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const phoneRaw = typeof record.collectInquiryPhone === 'string' ? record.collectInquiryPhone : '';
  return {
    collectInquiryPhone: normalizeCollectInquiryPhone(phoneRaw),
    damagePresets: parseDamagePresets(record.damagePresets),
    handoverRooms: parseHandoverRooms(record.handoverRooms),
  };
}

/** Map MD Settings → Shalom Replacement Costs catalog to caretaker damage presets. */
export function replacementCatalogToDamagePresets(
  catalog: readonly ReplacementCatalogEntry[],
): ShalomDamagePreset[] {
  return catalog.map((entry) => ({
    id: entry.id,
    label: entry.item,
    amountLkr: entry.cost,
  }));
}

/** Company replacement catalog is canonical; per-property presets are legacy fallback. */
export function resolveShalomDamagePresets(
  stayOps: ShalomStayOpsSettings,
  replacementCatalog: readonly ReplacementCatalogEntry[],
): ShalomDamagePreset[] {
  const fromCatalog = replacementCatalogToDamagePresets(replacementCatalog);
  if (fromCatalog.length > 0) return fromCatalog;
  return stayOps.damagePresets;
}

export function parseDamageItems(raw: unknown): ShalomRecordedDamage[] {
  if (!Array.isArray(raw)) return [];
  const damages: ShalomRecordedDamage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const preset = parseDamagePreset(row);
    const recordedAt = typeof row.recordedAt === 'string' ? row.recordedAt.trim() : '';
    const recordedByEpf = typeof row.recordedByEpf === 'string' ? row.recordedByEpf.trim() : '';
    const photoUrl = parseOptionalText(row.photoUrl);
    if (!preset || !recordedAt || !recordedByEpf) continue;
    damages.push({
      ...preset,
      recordedAt,
      recordedByEpf,
      ...(photoUrl ? { photoUrl } : {}),
    });
  }
  return damages;
}

export function parsePreHandoverPhotos(raw: unknown): ShalomPreHandoverPhoto[] {
  if (!Array.isArray(raw)) return [];

  const photos: ShalomPreHandoverPhoto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const photoUrl = parseOptionalText(row.photoUrl);
    const capturedAt = typeof row.capturedAt === 'string' ? row.capturedAt.trim() : '';
    const recordedByEpf =
      typeof row.recordedByEpf === 'string' ? row.recordedByEpf.trim() : undefined;
    if (!id || !label || !photoUrl || !capturedAt) continue;
    photos.push({
      id,
      label,
      photoUrl,
      capturedAt,
      ...(recordedByEpf ? { recordedByEpf } : {}),
    });
  }
  return photos;
}

function parseOptionalText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function mapShalomBookingStayOpsFromRow(
  row: Record<string, unknown>,
): ShalomBookingStayOps {
  return {
    caretakerCollectLkr: parseCaretakerCollectLkr(row.caretaker_collect_lkr),
    damages: parseDamageItems(row.damage_items),
    guestIdDocumentUrl: parseOptionalText(row.guest_id_document_url),
    invoiceEmail: parseOptionalText(row.invoice_email),
    invoiceSentAt: parseOptionalText(row.invoice_sent_at),
    invoiceReference: parseOptionalText(row.invoice_reference),
    preHandoverPhotos: parsePreHandoverPhotos(row.pre_handover_photos),
    preHandoverVerifiedAt: parseOptionalText(row.pre_handover_verified_at),
  };
}

export function stayOpsTotalDamages(damages: readonly Pick<ShalomRecordedDamage, 'amountLkr'>[]): number {
  return damages.reduce((sum, damage) => sum + (parsePositiveAmount(damage.amountLkr) ?? 0), 0);
}

export function stayOpsGrandTotal(
  collectLkr: number | null | undefined,
  damages: readonly Pick<ShalomRecordedDamage, 'amountLkr'>[],
): number {
  return (parsePositiveAmount(collectLkr) ?? 0) + stayOpsTotalDamages(damages);
}
