'use client';

import { AlertTriangle, CameraOff, PauseCircle } from 'lucide-react';
import type { SmVisitVerificationRecord } from './actions';
import SmVerificationQueue from './SmVerificationQueue';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function SmHoldPanel({
  visits,
  onRefresh,
}: {
  visits: SmVisitVerificationRecord[];
  onRefresh: () => void;
}) {
  const missingPhoto = visits.filter((v) => !v.photoUrl);
  const flagged = visits.filter((v) => v.photoUrl && v.verificationStatus === 'FLAGGED');

  if (!visits.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-8 py-16 text-center">
        <PauseCircle className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-4 text-sm font-bold text-slate-600">No visits on hold</p>
        <p className="mt-1 text-xs text-slate-500">
          Missing selfies and flagged visits appear here until resolved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/40 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p className="text-xs leading-relaxed text-amber-950">
          On-hold visits do not appear in the active verification grid. Flagged visits can be
          re-approved below; missing photos must be captured from the SM portal.
        </p>
      </div>

      {missingPhoto.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">
              Missing visit photo
            </h3>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-black text-slate-700">
              {missingPhoto.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {missingPhoto.map((visit) => (
              <div
                key={visit.id}
                className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <CameraOff className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {visit.smName ?? visit.smEpf}
                    </p>
                    <p className="font-mono text-xs text-slate-500">EPF {visit.smEpf}</p>
                    {visit.siteName && (
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {visit.siteName}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-600">
                      Visit logged {formatTime(visit.visitTime)} — awaiting selfie upload.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {flagged.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">
              Flagged for review
            </h3>
            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-black text-slate-700">
              {flagged.length}
            </span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <SmVerificationQueue visits={flagged} onRefresh={onRefresh} />
          </div>
        </section>
      )}
    </div>
  );
}
