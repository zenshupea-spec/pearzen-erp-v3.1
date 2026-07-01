'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Airplay, ChevronLeft, ChevronRight, Globe, Lock, Phone, X } from 'lucide-react';

import PwaPortalLoading from '../../../../packages/pwa-shell/PwaPortalLoading';
import {
  getShalomFrontCalendarData,
  getShalomFrontGuestIdSignedUrlAction,
  recordShalomBookingDamagesAction,
  sendShalomStayInvoiceAction,
  uploadShalomDamagePhotoAction,
  uploadShalomGuestIdAction,
  uploadShalomHandoverPhotoAction,
  type ShalomFrontCalendarBooking,
  type ShalomFrontCalendarProperty,
} from '../../app/shalom-front/actions';
import { CVS_BRAND_CLASSES } from '../../lib/cvs-brand-tokens';
import { ShalomLoginDayDot } from '../shalom/ShalomLoginDayDot';
import {
  buildShalomCalendarCells,
  buildShalomLoginDateSet,
  caretakerCollectTotalForDay,
  findBookingsForDay,
  formatShalomCollectLkr,
  hasCaretakerCollectAmount,
  isShalomAvailabilityBlock,
  normalizeShalomCalendarChannel,
  parseCaretakerCollectLkr,
  primaryBookingForDay,
  resolveShalomLoginDotStatus,
  shalomCalendarDayLabel,
  SHALOM_CALENDAR_DAY_NAMES,
  SHALOM_CALENDAR_MONTH_NAMES,
  shalomDateKey,
  type ShalomCalendarChannel,
} from '../../lib/shalom-calendar';
import { shalomPortalLoginDateColombo } from '../../lib/shalom-front-auth-shared';
import { compressShalomGuestIdFile } from '../../lib/shalom-guest-id-compress-client';
import {
  formatStayOpsPhoneForTel,
  resolveCollectInquiryPhone,
  resolveHandoverRooms,
  stayOpsGrandTotal,
  stayOpsTotalDamages,
  type ShalomDamagePreset,
  type ShalomDamageRecordEntry,
  type ShalomHandoverRoom,
  type ShalomPreHandoverPhoto,
  type ShalomRecordedDamage,
} from '../../lib/shalom-stay-ops';

const STAY_OPS_SECTION_CLS = 'mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3';
const STAY_OPS_STEP_LABEL_CLS = 'text-xs font-black uppercase tracking-widest text-slate-800';
const STAY_OPS_PRIMARY_BTN_CLS =
  'flex min-h-[52px] w-full items-center justify-center rounded-xl px-4 text-base font-bold shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const CHANNEL_META: Record<
  ShalomCalendarChannel,
  { label: string; bg: string; text: string; border: string }
> = {
  AIRBNB: {
    label: 'Airbnb',
    bg: 'bg-rose-100/90',
    text: 'text-rose-900',
    border: 'border-rose-200',
  },
  BOOKING: {
    label: 'Booking.com',
    bg: 'bg-blue-100/90',
    text: 'text-blue-900',
    border: 'border-blue-200',
  },
  BLOCKED: {
    label: 'Blocked',
    bg: 'bg-slate-100/90',
    text: 'text-slate-500',
    border: 'border-slate-200',
  },
};

const PROPERTY_BADGE_COLORS = [
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-sky-100 text-sky-900 border-sky-200',
  'bg-violet-100 text-violet-900 border-violet-200',
  'bg-amber-100 text-amber-900 border-amber-200',
];

function channelIcon(channel: ShalomCalendarChannel) {
  if (channel === 'AIRBNB') return Airplay;
  if (channel === 'BOOKING') return Globe;
  return Lock;
}

function StayOpsCallSupportButton({
  phone,
  iconOnly = false,
  className,
}: {
  phone: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const href = formatStayOpsPhoneForTel(phone);

  if (iconOnly) {
    return (
      <a
        href={href}
        aria-label="Call support"
        className={
          className ??
          'inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-600 bg-emerald-600 text-white shadow-md transition-colors hover:bg-emerald-700'
        }
      >
        <Phone className="h-5 w-5" />
      </a>
    );
  }

  return (
    <a
      href={href}
      aria-label="Call support"
      className={
        className ??
        'inline-flex items-center gap-2 rounded-full border border-amber-500 bg-amber-600 px-3 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-amber-700'
      }
    >
      <Phone className="h-4 w-4" />
      Call support
    </a>
  );
}

function StayPreHandoverSection({
  booking,
  handoverRooms,
  onPhotosUpdated,
}: {
  booking: ShalomFrontCalendarBooking;
  handoverRooms: ShalomHandoverRoom[];
  onPhotosUpdated: (patch: {
    preHandoverPhotos: ShalomPreHandoverPhoto[];
    preHandoverVerifiedAt: string | null;
  }) => void;
}) {
  const [uploadingRoomId, setUploadingRoomId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewByRoomId, setPreviewByRoomId] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const photoByRoomId = useMemo(() => {
    const map = new Map<string, ShalomPreHandoverPhoto>();
    for (const photo of booking.preHandoverPhotos) {
      map.set(photo.id, photo);
    }
    return map;
  }, [booking.preHandoverPhotos]);

  const rooms = useMemo(() => resolveHandoverRooms(handoverRooms), [handoverRooms]);
  const isVerified = Boolean(booking.preHandoverVerifiedAt);

  const handlePhotoSelected = async (roomId: string, file: File) => {
    setUploadingRoomId(roomId);
    setUploadError(null);
    try {
      const compressed = await compressShalomGuestIdFile(file);
      setPreviewByRoomId((current) => ({
        ...current,
        [roomId]: compressed.previewUrl,
      }));

      const formData = new FormData();
      formData.append('file', compressed.file);
      const result = await uploadShalomHandoverPhotoAction(booking.id, roomId, formData);
      if (!result.success || !result.photos) {
        setUploadError(result.error ?? 'Photo upload failed.');
        setPreviewByRoomId((current) => {
          const next = { ...current };
          delete next[roomId];
          return next;
        });
        return;
      }

      if (compressed.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(compressed.previewUrl);
      }

      if (result.signedUrl) {
        setPreviewByRoomId((current) => ({
          ...current,
          [roomId]: result.signedUrl!,
        }));
      } else {
        setPreviewByRoomId((current) => {
          const next = { ...current };
          delete next[roomId];
          return next;
        });
      }

      onPhotosUpdated({
        preHandoverPhotos: result.photos,
        preHandoverVerifiedAt: result.preHandoverVerifiedAt ?? null,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Photo upload failed.');
      setPreviewByRoomId((current) => {
        const next = { ...current };
        delete next[roomId];
        return next;
      });
    } finally {
      setUploadingRoomId(null);
    }
  };

  return (
    <div className={`${STAY_OPS_SECTION_CLS} border-sky-200 bg-sky-50/70`}>
      <p className={STAY_OPS_STEP_LABEL_CLS}>Pre-handover room photos</p>
      <p className="mt-1 text-xs text-slate-600">
        Photograph each room before the guest arrives.
        {handoverRooms.length === 0 ? ' Using MD default room list until customized.' : ''}
        {isVerified ? ' All rooms captured.' : ''}
      </p>

      <ul className="mt-3 space-y-3">
        {rooms.map((room) => {
          const saved = photoByRoomId.get(room.id);
          const preview = previewByRoomId[room.id];
          const uploading = uploadingRoomId === room.id;
          return (
            <li
              key={room.id}
              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{room.label}</p>
                {saved ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Captured
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Pending
                  </span>
                )}
              </div>

              {preview ? (
                <img
                  src={preview}
                  alt={`${room.label} condition`}
                  className="mt-2 max-h-28 w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
                />
              ) : null}

              <input
                ref={(node) => {
                  fileInputRefs.current[room.id] = node;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handlePhotoSelected(room.id, file);
                  event.target.value = '';
                }}
              />

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRefs.current[room.id]?.click()}
                className={`${STAY_OPS_PRIMARY_BTN_CLS} mt-2 border border-sky-300 bg-sky-600 text-white hover:bg-sky-700`}
              >
                {uploading ? 'Uploading…' : saved ? 'Retake photo' : 'Open camera'}
              </button>
            </li>
          );
        })}
      </ul>

      {uploadError ? <p className="mt-2 text-xs font-semibold text-rose-700">{uploadError}</p> : null}
    </div>
  );
}

function StayCollectSection({
  booking,
  collectInquiryPhone,
}: {
  booking: ShalomFrontCalendarBooking;
  collectInquiryPhone: string;
}) {
  if (isShalomAvailabilityBlock(booking)) return null;

  const collectAmount = parseCaretakerCollectLkr(booking.caretakerCollectLkr);
  const damagesTotal = stayOpsTotalDamages(booking.damages);
  const grandTotal = stayOpsGrandTotal(booking.caretakerCollectLkr, booking.damages);
  const hasCollect = hasCaretakerCollectAmount(booking);

  if (hasCollect || damagesTotal > 0) {
    return (
      <div className={`${STAY_OPS_SECTION_CLS} border-emerald-200 bg-emerald-50/80`}>
        <p className={STAY_OPS_STEP_LABEL_CLS}>① Collect payment</p>
        {hasCollect && damagesTotal > 0 ? (
          <>
            <p className="mt-2 text-sm font-semibold text-emerald-900">
              Stay {formatShalomCollectLkr(collectAmount!)} + damages{' '}
              {formatShalomCollectLkr(damagesTotal)}
            </p>
            <p className="mt-1 text-xl font-black text-emerald-900">
              Collect: {formatShalomCollectLkr(grandTotal)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xl font-black text-emerald-900">
            Collect: {formatShalomCollectLkr(hasCollect ? collectAmount! : damagesTotal)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`${STAY_OPS_SECTION_CLS} border-amber-200 bg-amber-50/80`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={STAY_OPS_STEP_LABEL_CLS}>① Collect payment</p>
          <p className="mt-2 text-sm font-semibold text-amber-950">Amount not set yet</p>
        </div>
        <StayOpsCallSupportButton phone={collectInquiryPhone} />
      </div>
    </div>
  );
}

function DamagePresetPickerModal({
  open,
  bookingId,
  presets,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  bookingId: string;
  presets: ShalomDamagePreset[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (entries: ShalomDamageRecordEntry[]) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [photoByPresetId, setPhotoByPresetId] = useState<
    Record<string, { previewUrl: string; photoUrl: string }>
  >({});
  const [uploadingPresetId, setUploadingPresetId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setPhotoByPresetId({});
    setUploadingPresetId(null);
    setUploadError(null);
  }, [open]);

  if (!open) return null;

  const togglePreset = (presetId: string) => {
    setSelectedIds((current) => {
      if (current.includes(presetId)) {
        setPhotoByPresetId((photos) => {
          const next = { ...photos };
          const existing = next[presetId];
          if (existing?.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(existing.previewUrl);
          }
          delete next[presetId];
          return next;
        });
        return current.filter((id) => id !== presetId);
      }
      window.setTimeout(() => fileInputRefs.current[presetId]?.click(), 0);
      return [...current, presetId];
    });
  };

  const handlePhotoSelected = async (presetId: string, file: File) => {
    setUploadingPresetId(presetId);
    setUploadError(null);
    try {
      const compressed = await compressShalomGuestIdFile(file);
      setPhotoByPresetId((photos) => ({
        ...photos,
        [presetId]: { previewUrl: compressed.previewUrl, photoUrl: '' },
      }));

      const formData = new FormData();
      formData.append('file', compressed.file);
      const result = await uploadShalomDamagePhotoAction(bookingId, presetId, formData);
      if (!result.success || !result.photoUrl) {
        setUploadError(result.error ?? 'Photo upload failed.');
        setPhotoByPresetId((photos) => {
          const next = { ...photos };
          const existing = next[presetId];
          if (existing?.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(existing.previewUrl);
          }
          delete next[presetId];
          return next;
        });
        return;
      }

      if (compressed.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(compressed.previewUrl);
      }

      setPhotoByPresetId((photos) => ({
        ...photos,
        [presetId]: {
          previewUrl: result.signedUrl ?? compressed.previewUrl,
          photoUrl: result.photoUrl,
        },
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Photo upload failed.');
      setPhotoByPresetId((photos) => {
        const next = { ...photos };
        const existing = next[presetId];
        if (existing?.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(existing.previewUrl);
        }
        delete next[presetId];
        return next;
      });
    } finally {
      setUploadingPresetId(null);
    }
  };

  const allSelectedHavePhotos = selectedIds.every((presetId) => photoByPresetId[presetId]?.photoUrl);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center overflow-x-hidden bg-slate-900/50 p-3 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close damage list" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-md min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-base font-black text-slate-900">Record damage</h3>
            <p className="mt-1 text-sm text-slate-600">
              Tick a damage type, then take a photo for each one before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          {presets.map((preset) => {
            const checked = selectedIds.includes(preset.id);
            const photo = photoByPresetId[preset.id];
            const uploading = uploadingPresetId === preset.id;
            return (
              <li key={preset.id} className="border-b border-slate-100 last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePreset(preset.id)}
                    className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40"
                  />
                  <span className="min-w-0 flex-1 font-semibold text-slate-900">{preset.label}</span>
                  <span className="font-bold text-slate-800">{formatShalomCollectLkr(preset.amountLkr)}</span>
                </label>

                {checked ? (
                  <div className="pb-3 pl-8">
                    {photo?.previewUrl ? (
                      <img
                        src={photo.previewUrl}
                        alt={`${preset.label} damage`}
                        className="mt-1 max-h-24 w-full max-w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
                      />
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-amber-800">
                        Photo required — tap the button below or choose a file.
                      </p>
                    )}

                    {photo?.photoUrl ? (
                      <p className="mt-1 text-xs font-bold text-emerald-700">Photo ready</p>
                    ) : null}

                    <input
                      ref={(node) => {
                        fileInputRefs.current[preset.id] = node;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handlePhotoSelected(preset.id, file);
                        event.target.value = '';
                      }}
                    />

                    <button
                      type="button"
                      disabled={uploading || saving}
                      onClick={() => fileInputRefs.current[preset.id]?.click()}
                      className={`${STAY_OPS_PRIMARY_BTN_CLS} mt-2 min-h-[44px] border-2 ${
                        photo?.photoUrl
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                          : 'border-slate-800 bg-white text-slate-900 hover:bg-slate-50'
                      } text-sm`}
                    >
                      {uploading
                        ? 'Uploading…'
                        : photo?.photoUrl
                          ? 'Retake photo'
                          : 'Take damage photo'}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {error || uploadError ? (
          <p className="px-4 pb-2 text-xs font-semibold text-rose-700 sm:px-5">{error ?? uploadError}</p>
        ) : null}

        <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
          {selectedIds.length > 0 && !allSelectedHavePhotos ? (
            <p className="mb-3 text-center text-xs font-semibold text-amber-800">
              Add a photo for each selected damage type to enable save.
            </p>
          ) : null}
          <button
            type="button"
            disabled={saving || selectedIds.length === 0 || !allSelectedHavePhotos}
            onClick={() =>
              void onConfirm(
                selectedIds.map((presetId) => ({
                  presetId,
                  photoUrl: photoByPresetId[presetId].photoUrl,
                })),
              )
            }
            className={`${STAY_OPS_PRIMARY_BTN_CLS} border border-slate-700 bg-slate-900 text-white hover:bg-slate-800`}
          >
            {saving
              ? 'Saving…'
              : selectedIds.length > 0 && !allSelectedHavePhotos
                ? `Photo required (${selectedIds.length})`
                : `Add selected (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StayDamageSection({
  booking,
  damagePresets,
  onDamagesUpdated,
}: {
  booking: ShalomFrontCalendarBooking;
  damagePresets: ShalomDamagePreset[];
  onDamagesUpdated: (damages: ShalomRecordedDamage[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isShalomAvailabilityBlock(booking)) return null;

  const damagesTotal = stayOpsTotalDamages(booking.damages);
  const hasPresets = damagePresets.length > 0;

  const handleConfirmDamages = async (entries: ShalomDamageRecordEntry[]) => {
    setSaving(true);
    setError(null);
    const result = await recordShalomBookingDamagesAction(booking.id, entries);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Could not save damage.');
      return;
    }
    onDamagesUpdated(result.damages ?? []);
    setPickerOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={!hasPresets}
        onClick={() => {
          if (!hasPresets) return;
          setError(null);
          setPickerOpen(true);
        }}
        className={`${STAY_OPS_SECTION_CLS} w-full text-left transition-colors ${
          hasPresets ? 'hover:border-slate-300 hover:bg-slate-50/80' : 'cursor-default'
        }`}
      >
        <p className={STAY_OPS_STEP_LABEL_CLS}>② Record damage</p>

        {!hasPresets ? (
          <p className="mt-2 text-sm text-slate-600">No damage types configured yet.</p>
        ) : (
          <p className="mt-2 text-sm font-semibold text-slate-700">
            Tap to choose from {damagePresets.length} damage type{damagePresets.length === 1 ? '' : 's'}
          </p>
        )}

        {booking.damages.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {booking.damages.map((damage, index) => (
              <li
                key={`${damage.id}-${damage.recordedAt}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-slate-800">{damage.label}</span>
                <span className="font-bold text-slate-900">{formatShalomCollectLkr(damage.amountLkr)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {damagesTotal > 0 ? (
          <p className="mt-3 text-sm font-bold text-slate-900">
            Damages total: {formatShalomCollectLkr(damagesTotal)}
          </p>
        ) : null}

        {error && !pickerOpen ? (
          <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p>
        ) : null}
      </button>

      <DamagePresetPickerModal
        open={pickerOpen}
        bookingId={booking.id}
        presets={damagePresets}
        saving={saving}
        error={error}
        onClose={() => {
          if (saving) return;
          setPickerOpen(false);
          setError(null);
        }}
        onConfirm={handleConfirmDamages}
      />
    </>
  );
}

function StayGuestIdSection({
  booking,
  onUploaded,
}: {
  booking: ShalomFrontCalendarBooking;
  onUploaded: (guestIdDocumentUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!booking.guestIdDocumentUrl) {
      setPreviewUrl(null);
      return;
    }

    setLoadingPreview(true);
    void getShalomFrontGuestIdSignedUrlAction(booking.id).then((result) => {
      if (cancelled) return;
      setLoadingPreview(false);
      if (result.success && result.signedUrl) {
        setPreviewUrl(result.signedUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [booking.id, booking.guestIdDocumentUrl]);

  if (isShalomAvailabilityBlock(booking)) return null;

  const hasPhoto = Boolean(booking.guestIdDocumentUrl);
  const busy = compressing || uploading || loadingPreview;

  const handleFile = async (file: File) => {
    setError(null);
    setCompressing(true);
    try {
      const compressed = await compressShalomGuestIdFile(file);
      setPreviewUrl(compressed.previewUrl);
      setCompressing(false);
      setUploading(true);

      const formData = new FormData();
      formData.append('file', compressed.file);
      const result = await uploadShalomGuestIdAction(booking.id, formData);
      setUploading(false);

      if (!result.success) {
        setError(result.error ?? 'Upload failed.');
        return;
      }

      URL.revokeObjectURL(compressed.previewUrl);
      if (result.signedUrl) setPreviewUrl(result.signedUrl);
      if (result.guestIdDocumentUrl) {
        onUploaded(result.guestIdDocumentUrl);
      }
    } catch (err) {
      setCompressing(false);
      setUploading(false);
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  return (
    <div className={STAY_OPS_SECTION_CLS}>
      <p className={STAY_OPS_STEP_LABEL_CLS}>③ Guest ID photo</p>
      <p className="mt-2 text-sm font-semibold text-slate-700">
        {hasPhoto ? 'Uploaded ✓' : 'Not uploaded yet'}
      </p>

      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Guest NIC or passport"
          className="mt-3 max-h-44 w-full max-w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
        />
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`${STAY_OPS_PRIMARY_BTN_CLS} mt-3 border-2 border-slate-800 bg-white text-slate-900 hover:bg-slate-50`}
      >
        {compressing ? 'Compressing…' : uploading ? 'Uploading…' : 'Upload NIC or passport'}
      </button>

      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}

function StayInvoiceSection({
  booking,
  onInvoiceUpdated,
}: {
  booking: ShalomFrontCalendarBooking;
  onInvoiceUpdated: (patch: {
    invoiceEmail?: string | null;
    invoiceReference?: string | null;
    invoiceSentAt?: string | null;
  }) => void;
}) {
  const [email, setEmail] = useState(booking.invoiceEmail ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setEmail(booking.invoiceEmail ?? '');
  }, [booking.id, booking.invoiceEmail]);

  if (isShalomAvailabilityBlock(booking)) return null;

  const hasEmail = email.trim().length > 0;

  const handleGenerate = async () => {
    if (!hasEmail) {
      setError('Enter the guest email address.');
      return;
    }

    setSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await sendShalomStayInvoiceAction(booking.id, email.trim());

      if (!result.success) {
        setError(result.error ?? 'Could not send invoice.');
        return;
      }

      onInvoiceUpdated({
        invoiceEmail: result.email ?? email.trim(),
        invoiceReference: result.reference ?? booking.invoiceReference,
        invoiceSentAt: result.invoiceSentAt ?? booking.invoiceSentAt,
      });

      if (result.emailed && result.email) {
        setSuccessMessage(`Invoice sent to ${result.email}`);
        return;
      }
      setError(result.error ?? 'Invoice could not be emailed. Check server email settings.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invoice.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={STAY_OPS_SECTION_CLS}>
      <p className={STAY_OPS_STEP_LABEL_CLS}>④ Invoice</p>

      {booking.invoiceSentAt ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">
          Sent {new Date(booking.invoiceSentAt).toLocaleString('en-GB')}
          {booking.invoiceEmail ? ` to ${booking.invoiceEmail}` : ''}
        </p>
      ) : null}

      <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600">
        Guest email for invoice
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
            setSuccessMessage(null);
          }}
          placeholder="guest@example.com"
          className="mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
      </label>

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={sending || !hasEmail}
        className={`${STAY_OPS_PRIMARY_BTN_CLS} mt-3 border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}
      >
        {sending ? 'Sending…' : 'Send invoice'}
      </button>

      {successMessage ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          {successMessage}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}

function BookingDetailDrawer({
  bookings,
  propertyById,
  onClose,
  onBookingUpdate,
}: {
  bookings: ShalomFrontCalendarBooking[];
  propertyById: Map<string, ShalomFrontCalendarProperty>;
  onClose: () => void;
  onBookingUpdate: (bookingId: string, patch: Partial<ShalomFrontCalendarBooking>) => void;
}) {
  const hasGuestStay = bookings.some((booking) => !isShalomAvailabilityBlock(booking));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-slate-900/40 p-3 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="overflow-x-hidden overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900">Stay details</h2>
              <div className="mt-2 border-b border-slate-200" />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                {hasGuestStay
                  ? 'Work through steps ①–④ below'
                  : bookings.length > 1
                    ? `${bookings.length} blocked periods`
                    : 'Blocked dates'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-4">
            {bookings.map((booking) => {
              const channel = normalizeShalomCalendarChannel(booking.channel);
              const Icon = channelIcon(channel);
              const meta = CHANNEL_META[channel];
              const property = propertyById.get(booking.propertyId);
              const collectInquiryPhone = resolveCollectInquiryPhone(property?.collectInquiryPhone);
              const isGuest = !isShalomAvailabilityBlock(booking);
              return (
                <li
                  key={`${booking.id}-${booking.propertyId}`}
                  className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className={`h-4 w-4 flex-shrink-0 ${meta.text}`} />
                      <p className="truncate text-sm font-bold text-slate-900">{booking.propertyName}</p>
                    </div>
                    <p className="break-words text-sm font-semibold text-slate-800">
                      {isGuest ? booking.guestName : 'Blocked'}
                    </p>
                    <p className="text-xs text-slate-600">
                      {booking.checkIn} → {booking.checkOut} · {booking.nights} night
                      {booking.nights === 1 ? '' : 's'} · {meta.label}
                      {booking.otaImported ? ' · OTA sync' : ''}
                    </p>
                  </div>
                  {isGuest ? (
                    <>
                      <StayPreHandoverSection
                        booking={booking}
                        handoverRooms={property?.handoverRooms ?? []}
                        onPhotosUpdated={(patch) => onBookingUpdate(booking.id, patch)}
                      />
                      <StayCollectSection
                        booking={booking}
                        collectInquiryPhone={collectInquiryPhone}
                      />
                      <StayDamageSection
                        booking={booking}
                        damagePresets={property?.damagePresets ?? []}
                        onDamagesUpdated={(damages) => onBookingUpdate(booking.id, { damages })}
                      />
                      <StayGuestIdSection
                        booking={booking}
                        onUploaded={(guestIdDocumentUrl) =>
                          onBookingUpdate(booking.id, { guestIdDocumentUrl })
                        }
                      />
                      <StayInvoiceSection
                        booking={booking}
                        onInvoiceUpdated={(patch) => onBookingUpdate(booking.id, patch)}
                      />
                      <div className="mt-4 flex justify-center border-t border-slate-200 pt-3">
                        <StayOpsCallSupportButton phone={collectInquiryPhone} iconOnly />
                      </div>
                    </>
                  ) : null}
                  {booking.notes && isGuest ? (
                    <p className="mt-2 break-words text-xs text-slate-600">{booking.notes}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function ShalomFrontCalendar() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [properties, setProperties] = useState<ShalomFrontCalendarProperty[]>([]);
  const [bookings, setBookings] = useState<ShalomFrontCalendarBooking[]>([]);
  const [loginDates, setLoginDates] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDayBookings, setSelectedDayBookings] = useState<ShalomFrontCalendarBooking[]>(
    [],
  );

  const loadCalendar = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      const result = await getShalomFrontCalendarData(year, month);
      setProperties(result.properties);
      setBookings(result.bookings);
      setLoginDates(buildShalomLoginDateSet(result.loginDates));
      setLoadError(result.error ?? null);
    } catch {
      setLoadError('Could not load calendar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendar(viewYear, viewMonth);
  }, [loadCalendar, viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((year) => year - 1);
      return;
    }
    setViewMonth((month) => month - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((year) => year + 1);
      return;
    }
    setViewMonth((month) => month + 1);
  };

  const cells = buildShalomCalendarCells(viewYear, viewMonth);
  const today = new Date();
  const todayKey = shalomPortalLoginDateColombo(today);
  const isCurrentMonth =
    today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth;
  const multiProperty = properties.length > 1;
  const propertyById = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties],
  );

  const handleBookingUpdate = useCallback(
    (bookingId: string, patch: Partial<ShalomFrontCalendarBooking>) => {
      setSelectedDayBookings((prev) =>
        prev.map((booking) => (booking.id === bookingId ? { ...booking, ...patch } : booking)),
      );
      setBookings((prev) =>
        prev.map((booking) => (booking.id === bookingId ? { ...booking, ...patch } : booking)),
      );
    },
    [],
  );

  return (
    <div className="space-y-4">
      {properties.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {properties.map((property, index) => (
            <span
              key={property.id}
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                PROPERTY_BADGE_COLORS[index % PROPERTY_BADGE_COLORS.length]
              }`}
            >
              {property.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)]/50 px-4 py-3 text-sm font-semibold text-slate-600">
          No properties assigned yet. Ask MD to assign your EPF on a Shalom residence.
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/55 bg-white/55 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.12)] backdrop-blur-xl ring-1 ring-slate-200/50">
        <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/45 px-4 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]/60 hover:text-[color:var(--cvs-accent)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-wider text-slate-900">
              {SHALOM_CALENDAR_MONTH_NAMES[viewMonth - 1]} {viewYear}
            </p>
            {multiProperty ? (
              <p className="text-[10px] font-semibold text-slate-500">
                {properties.length} properties merged
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]/60 hover:text-[color:var(--cvs-accent)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loadError ? (
          <p className="px-4 py-6 text-sm font-semibold text-amber-800">{loadError}</p>
        ) : loading ? (
          <PwaPortalLoading portal="shalom-front" message="Loading calendar…" className="min-h-[14rem] py-10" />
        ) : (
          <div className="p-4">
            <div className="mb-1 grid grid-cols-7 gap-1">
              {SHALOM_CALENDAR_DAY_NAMES.map((day) => (
                <div
                  key={day}
                  className="py-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="min-h-[4.5rem] rounded-xl" />;
                }

                const dayBookings = findBookingsForDay(bookings, viewYear, viewMonth, day);
                const booking = primaryBookingForDay(bookings, viewYear, viewMonth, day);
                const key = shalomDateKey(viewYear, viewMonth, day);
                const isToday = isCurrentMonth && today.getDate() === day;
                const channel = booking ? normalizeShalomCalendarChannel(booking.channel) : null;
                const meta = channel ? CHANNEL_META[channel] : null;
                const isBlockDay = Boolean(booking && isShalomAvailabilityBlock(booking));
                const dayCollectTotal = caretakerCollectTotalForDay(dayBookings);
                const loginDotStatus = resolveShalomLoginDotStatus(key, loginDates, todayKey);

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={dayBookings.length === 0}
                    onClick={() => dayBookings.length > 0 && setSelectedDayBookings(dayBookings)}
                    className={[
                      'relative flex min-h-[4.5rem] flex-col items-center justify-start overflow-hidden rounded-xl border pt-1.5 text-left transition-all select-none',
                      booking
                        ? `${meta!.bg} ${meta!.border} hover:scale-[1.02] hover:shadow-md${
                            isBlockDay ? ' ring-1 ring-inset ring-slate-400/50' : ''
                          }`
                        : 'border-slate-200/60 bg-slate-50/80',
                      isToday ? 'ring-2 ring-[color:var(--cvs-accent-muted)] ring-offset-1 ring-offset-white' : '',
                      dayBookings.length === 0 ? 'cursor-default' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    <ShalomLoginDayDot status={loginDotStatus} />
                    <span
                      className={[
                        'text-sm font-bold',
                        isToday ? 'text-[color:var(--cvs-accent)]' : meta ? meta.text : 'text-slate-600',
                      ].join(' ')}
                    >
                      {day}
                    </span>

                    {booking && !isBlockDay ? (
                      <span
                        className={`mt-0.5 max-w-full truncate px-1 text-[9px] font-bold leading-tight ${meta!.text}`}
                      >
                        {multiProperty && dayBookings.length === 1
                          ? `${booking.propertyName.split(' ').slice(-1)[0]}: ${shalomCalendarDayLabel(booking)}`
                          : dayBookings.length > 1
                            ? `${dayBookings.length} stays`
                            : shalomCalendarDayLabel(booking)}
                      </span>
                    ) : null}

                    {isBlockDay ? (
                      <span
                        className={`mt-0.5 flex items-center gap-0.5 text-[8px] font-bold leading-tight ${meta!.text}`}
                      >
                        <Lock className="h-2.5 w-2.5" />
                        Block
                      </span>
                    ) : null}

                    {dayCollectTotal > 0 ? (
                      <span
                        className={`mt-0.5 max-w-full truncate px-1 text-[7px] font-black leading-tight ${meta?.text ?? 'text-emerald-800'}`}
                      >
                        Collect: {formatShalomCollectLkr(dayCollectTotal)}
                      </span>
                    ) : null}

                    {booking && key === booking.checkIn ? (
                      <span
                        className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                          channel === 'AIRBNB'
                            ? 'bg-rose-500'
                            : channel === 'BOOKING'
                              ? 'bg-blue-500'
                              : 'bg-slate-400'
                        }`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200/70 bg-white/40 px-4 py-3 text-[11px] leading-relaxed text-slate-600">
          Read-only view across your assigned properties.{' '}
          <span className={`font-bold ${CVS_BRAND_CLASSES.portalEyebrow}`}>Green dot</span> = you logged in that day;{' '}
          <span className="font-bold text-rose-600">red</span> = missed login. Collect amounts are set by MD. Tap a
          coloured day for stay details.
        </div>
      </div>

      {selectedDayBookings.length > 0 ? (
        <BookingDetailDrawer
          bookings={selectedDayBookings}
          propertyById={propertyById}
          onBookingUpdate={handleBookingUpdate}
          onClose={() => setSelectedDayBookings([])}
        />
      ) : null}
    </div>
  );
}
