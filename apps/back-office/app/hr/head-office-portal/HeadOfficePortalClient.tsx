'use client';

import Link from 'next/link';
import { Building2, ExternalLink } from 'lucide-react';

import HrPortalAuthControls from '../../../components/hr/HrPortalAuthControls';
import type { HeadOfficePortalStaffRow } from './actions';

function formatOtpTime(iso: string | null): string {
  if (!iso) return 'Never provisioned';
  try {
    return new Intl.DateTimeFormat('en-LK', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function HeadOfficePortalClient({
  staff,
}: {
  staff: HeadOfficePortalStaffRow[];
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold leading-relaxed text-slate-600">
        Issue first-time and reset OTPs for Head Office portal staff —{' '}
        <strong>FM</strong>, <strong>EA</strong>, <strong>OM</strong>, and <strong>TM</strong>.
        FM and EA sign in at <strong>/login/hq</strong>; OM and TM use their dedicated portals.
        HR-desk OTP is shown on screen (not emailed) unless the rank receives work-email delivery.
      </p>

      <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
        <p className="font-bold">MD, OD, and HR portal OTP</p>
        <p className="mt-1 text-sky-900">
          Executives and HR receive emailed OTP from{' '}
          <Link
            href="/executive/access"
            className="inline-flex items-center gap-1 font-bold underline hover:text-sky-700"
          >
            Executive → Security &amp; Access
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          , not this desk.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-violet-700" />
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">
              HQ portal staff ({staff.length})
            </h2>
          </div>
        </div>

        {staff.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
            No active Head Office portal staff found. Set corporate group to Head Office, assign
            FM / EA / OM / TM rank, and add a work email on the MNR record.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {staff.map((person) => (
              <li key={person.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-900">{person.fullName}</p>
                    <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {person.rank ?? '—'}
                      {person.epfNo ? (
                        <>
                          <span className="mx-2 text-slate-300">·</span>
                          EPF {person.epfNo}
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">{person.email}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Last OTP: {formatOtpTime(person.lastOtpProvisionedAt)}
                      {person.loginUsername ? (
                        <>
                          {' '}
                          · Portal ID EPF {person.loginUsername}
                        </>
                      ) : null}
                      {person.isUsernameLocked ? (
                        <span className="ml-2 font-bold text-rose-700">Username locked</span>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    href="/hr/mnr"
                    className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700"
                  >
                    MNR
                  </Link>
                </div>
                <HrPortalAuthControls
                  employeeId={person.id}
                  employeeName={person.fullName}
                  employeeRank={person.rank}
                  isUsernameLocked={person.isUsernameLocked}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
