'use client';

import { useState } from 'react';
import { ImageOff, MapPin, UserCheck, X } from 'lucide-react';
import {
  processShiftVerification,
  revertRejectedShift,
  type ShiftVerificationRecord,
} from './actions';
import {
  isVerificationPhotoExpired,
  VERIFICATION_PHOTO_RETENTION_DAYS,
  formatIdPhotoDate,
  resolveIdPhotoCapturedAt,
} from './shift-verification-utils';
import {
  InlinePhoto,
  PhotoLightbox,
  VerificationActionButtons,
} from './verification-row-ui';

function formatShiftDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function resolvePhotoUrl(
  shiftDate: string,
  url: string | null | undefined,
): string | null | undefined {
  if (!url) return null;
  if (isVerificationPhotoExpired(shiftDate)) return null;
  return url;
}

function PhotoTile({
  label,
  url,
  accent = 'slate',
  emptyLabel,
  purged,
}: {
  label: string;
  url: string | null | undefined;
  accent?: 'slate' | 'emerald' | 'rose' | 'indigo';
  emptyLabel: string;
  purged?: boolean;
}) {
  const borderClass =
    accent === 'emerald'
      ? 'border-emerald-200'
      : accent === 'rose'
        ? 'border-rose-200'
        : accent === 'indigo'
          ? 'border-indigo-200'
          : 'border-slate-200';

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div
        className={`aspect-[4/5] overflow-hidden rounded-2xl border bg-slate-50 shadow-inner ${borderClass}`}
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
            {purged ? <ImageOff className="h-8 w-8 text-slate-300" /> : null}
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {purged ? 'Purged (60-day policy)' : emptyLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerificationQueue({
  shifts,
  onRefresh,
  selectedShift,
  onSelectedShiftChange,
  hideList = false,
  readOnly = false,
  allowRevert = false,
}: {
  shifts: ShiftVerificationRecord[];
  onRefresh: () => void;
  selectedShift?: ShiftVerificationRecord | null;
  onSelectedShiftChange?: (shift: ShiftVerificationRecord | null) => void;
  /** When true, only render the detail modal (archive drill-down). */
  hideList?: boolean;
  readOnly?: boolean;
  allowRevert?: boolean;
}) {
  const [internalSelected, setInternalSelected] = useState<ShiftVerificationRecord | null>(null);
  const activeShift = selectedShift !== undefined ? selectedShift : internalSelected;
  const setActiveShift = onSelectedShiftChange ?? setInternalSelected;
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ label: string; url: string } | null>(null);

  const photosPurged = activeShift ? isVerificationPhotoExpired(activeShift.shiftDate) : false;

  const handleVerify = async (
    shift: ShiftVerificationRecord,
    status: 'APPROVED' | 'FLAGGED' | 'REJECTED',
  ) => {
    if (isVerifying || readOnly) return;

    const logIds = [shift.checkIn?.id, shift.checkOut?.id].filter((id): id is string =>
      Boolean(id),
    );

    if (!logIds.length) return;

    setVerifyingKey(shift.shiftKey);
    try {
      const result = await processShiftVerification(logIds, status);
      if (result.success) {
        setActiveShift(null);
        onRefresh();
      } else {
        alert(result.error ?? 'Verification update failed.');
      }
    } finally {
      setVerifyingKey(null);
    }
  };

  const isVerifying = verifyingKey !== null;

  const handleRevert = async () => {
    if (!activeShift || isVerifying) return;
    const logIds = [activeShift.checkIn?.id, activeShift.checkOut?.id].filter(
      (id): id is string => Boolean(id),
    );
    if (!logIds.length) return;
    if (!confirm('Revert to pending review? Shift will leave payroll until re-approved.')) return;

    setVerifyingKey(activeShift.shiftKey);
    try {
      const result = await revertRejectedShift(logIds);
      if (result.success) {
        setActiveShift(null);
        onRefresh();
      } else {
        alert(result.error ?? 'Revert failed.');
      }
    } finally {
      setVerifyingKey(null);
    }
  };

  const openPhoto = (label: string, url: string | null | undefined) => {
    if (url) setLightbox({ label, url });
  };

  return (
    <>
      {!hideList && (
        <div className="divide-y divide-slate-100">
          {shifts.map((shift) => {
            const photosPurgedRow = isVerificationPhotoExpired(shift.shiftDate);
            const mnrUrl = shift.idPhotoUrl;
            const checkInUrl = resolvePhotoUrl(shift.shiftDate, shift.checkIn?.photo_url);
            const checkOutUrl = resolvePhotoUrl(shift.shiftDate, shift.checkOut?.photo_url);
            const rowVerifying = verifyingKey === shift.shiftKey;

            return (
              <div
                key={shift.shiftKey}
                className="flex flex-col gap-4 px-3 py-4 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
              >
                <div className="w-full min-w-0 sm:w-[7.5rem] sm:shrink-0">
                  <h3 className="truncate text-xs font-bold text-slate-900">
                    {shift.guardName ?? shift.empNumber}
                  </h3>
                  <p className="font-mono text-[10px] text-slate-500">EPF {shift.empNumber}</p>
                </div>

                <div className="flex w-full flex-wrap justify-center gap-2 sm:flex-1 sm:items-end sm:justify-start">
                  <InlinePhoto
                    label="MNR"
                    url={mnrUrl}
                    time={formatIdPhotoDate(
                      resolveIdPhotoCapturedAt(shift.idPhotoCapturedAt, mnrUrl),
                    )}
                    accent="indigo"
                    emptyLabel="No MNR"
                    onClick={() => openPhoto('HR master (MNR)', mnrUrl)}
                  />
                  <InlinePhoto
                    label="Check-in"
                    url={checkInUrl}
                    time={
                      shift.checkIn?.device_time
                        ? formatTime(shift.checkIn.device_time)
                        : null
                    }
                    accent="emerald"
                    emptyLabel="No photo"
                    purged={photosPurgedRow}
                    onClick={() => openPhoto('Check-in selfie', checkInUrl)}
                  />
                  <InlinePhoto
                    label="Check-out"
                    url={checkOutUrl}
                    time={
                      shift.checkOut?.device_time
                        ? formatTime(shift.checkOut.device_time)
                        : null
                    }
                    accent="rose"
                    emptyLabel="No photo"
                    purged={photosPurgedRow}
                    onClick={() => openPhoto('Check-out selfie', checkOutUrl)}
                  />
                </div>

                {!readOnly && (
                  <VerificationActionButtons
                    verifying={rowVerifying}
                    onReject={() => handleVerify(shift, 'REJECTED')}
                    onHold={() => handleVerify(shift, 'FLAGGED')}
                    onApprove={() => handleVerify(shift, 'APPROVED')}
                  />
                )}
              </div>
            );
          })}

          {shifts.length === 0 && (
            <div className="px-8 py-20 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <UserCheck className="h-7 w-7 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-700">Queue is clear</p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
                Shifts with complete field photos and no holds appear here. Check the On hold tab
                for missing selfies or timing exceptions.
              </p>
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <PhotoLightbox
          label={lightbox.label}
          url={lightbox.url}
          onClose={() => setLightbox(null)}
        />
      )}

      {activeShift && hideList && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  3-point verification
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  {activeShift.guardName ?? activeShift.empNumber}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  EPF {activeShift.empNumber} · {formatShiftDate(activeShift.shiftDate)}
                </p>
              </div>
              <button
                type="button"
                disabled={isVerifying}
                onClick={() => setActiveShift(null)}
                className="rounded-xl p-2 text-slate-400 ring-1 ring-slate-200 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {photosPurged && (
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs text-slate-600 sm:px-6">
                <ImageOff className="h-4 w-4 shrink-0" />
                Field selfies purged under {VERIFICATION_PHOTO_RETENTION_DAYS}-day retention.
                MNR may still be on file.
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
                <PhotoTile
                  label="HR master (MNR)"
                  url={activeShift.idPhotoUrl}
                  accent="indigo"
                  emptyLabel="No MNR on file"
                />
                <PhotoTile
                  label="Check-in selfie"
                  url={resolvePhotoUrl(activeShift.shiftDate, activeShift.checkIn?.photo_url)}
                  accent="emerald"
                  emptyLabel="No check-in photo"
                  purged={photosPurged}
                />
                <PhotoTile
                  label="Check-out selfie"
                  url={resolvePhotoUrl(activeShift.shiftDate, activeShift.checkOut?.photo_url)}
                  accent="rose"
                  emptyLabel="No check-out photo"
                  purged={photosPurged}
                />
              </div>

              <div className="grid gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:grid-cols-2 sm:px-6">
                <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs">
                  <p className="font-black uppercase tracking-widest text-slate-500">Check-in</p>
                  <p className="mt-1 font-mono text-slate-800">
                    {activeShift.checkIn?.device_time
                      ? formatTime(activeShift.checkIn.device_time)
                      : '—'}
                  </p>
                  {activeShift.checkIn?.latitude != null && (
                    <p className="mt-1 font-mono text-[10px] text-slate-400">
                      {activeShift.checkIn.latitude.toFixed(4)},{' '}
                      {activeShift.checkIn.longitude?.toFixed(4)}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs">
                  <p className="font-black uppercase tracking-widest text-slate-500">Check-out</p>
                  <p className="mt-1 font-mono text-slate-800">
                    {activeShift.checkOut?.device_time
                      ? formatTime(activeShift.checkOut.device_time)
                      : '—'}
                  </p>
                  {activeShift.checkOut?.latitude != null && (
                    <p className="mt-1 font-mono text-[10px] text-slate-400">
                      <MapPin className="mr-0.5 inline h-3 w-3" />
                      {activeShift.checkOut.latitude.toFixed(4)},{' '}
                      {activeShift.checkOut.longitude?.toFixed(4)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {readOnly && (
              <div className="border-t border-slate-100 px-5 py-4 text-center text-xs text-slate-500 sm:px-6">
                Archive view — record only. Approved shifts are already on payroll.
              </div>
            )}

            {allowRevert && (
              <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={handleRevert}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 text-[11px] font-black uppercase tracking-widest text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {isVerifying ? 'Working…' : 'Revert to active review'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
