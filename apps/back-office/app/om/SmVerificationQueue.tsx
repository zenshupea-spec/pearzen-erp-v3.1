'use client';

import { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { processSmVisitVerification, type SmVisitVerificationRecord } from './actions';
import {
  InlinePhoto,
  PhotoLightbox,
  VerificationActionButtons,
} from './verification-row-ui';
import { formatIdPhotoDate, resolveIdPhotoCapturedAt } from './shift-verification-utils';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function SmVerificationQueue({
  visits,
  onRefresh,
  readOnly = false,
}: {
  visits: SmVisitVerificationRecord[];
  onRefresh: () => void;
  readOnly?: boolean;
}) {
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ label: string; url: string } | null>(null);

  const handleVerify = async (visit: SmVisitVerificationRecord, status: 'APPROVED' | 'FLAGGED') => {
    if (verifyingKey) return;

    setVerifyingKey(visit.id);
    try {
      const result = await processSmVisitVerification(visit.id, status);
      if (result.success) {
        onRefresh();
      } else {
        alert(result.error ?? 'Verification update failed.');
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
      <div className="divide-y divide-slate-100">
        {visits.map((visit) => {
          const rowVerifying = verifyingKey === visit.id;

          return (
            <div
              key={visit.id}
              className="flex flex-col gap-4 px-3 py-4 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
            >
              <div className="w-full min-w-0 sm:w-[7.5rem] sm:shrink-0">
                <h3 className="truncate text-xs font-bold text-slate-900">
                  {visit.smName ?? visit.smEpf}
                </h3>
                <p className="font-mono text-[10px] text-slate-500">EPF {visit.smEpf}</p>
                {visit.siteName && (
                  <p className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                    {visit.siteName}
                  </p>
                )}
              </div>

              <div className="flex w-full flex-wrap justify-center gap-2 sm:flex-1 sm:items-end sm:justify-start">
                <InlinePhoto
                  label="MNR"
                  url={visit.idPhotoUrl}
                  time={formatIdPhotoDate(
                    resolveIdPhotoCapturedAt(visit.idPhotoCapturedAt, visit.idPhotoUrl),
                  )}
                  accent="indigo"
                  emptyLabel="No MNR"
                  onClick={() => openPhoto('HR master (MNR)', visit.idPhotoUrl)}
                />
                <InlinePhoto
                  label="Visit"
                  url={visit.photoUrl}
                  time={formatTime(visit.visitTime)}
                  accent="emerald"
                  emptyLabel="No photo"
                  onClick={() => openPhoto('Visit selfie', visit.photoUrl)}
                />
              </div>

              {!readOnly && (
                <VerificationActionButtons
                  verifying={rowVerifying}
                  showReject={false}
                  onHold={() => handleVerify(visit, 'FLAGGED')}
                  onApprove={() => handleVerify(visit, 'APPROVED')}
                />
              )}
            </div>
          );
        })}

        {visits.length === 0 && (
          <div className="px-8 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <UserCheck className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-700">Queue is clear</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
              Sector manager visit selfies from the SM portal will appear here once uploaded.
            </p>
          </div>
        )}
      </div>

      {lightbox && (
        <PhotoLightbox
          label={lightbox.label}
          url={lightbox.url}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
