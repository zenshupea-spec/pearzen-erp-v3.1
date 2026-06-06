import Link from 'next/link';
import { ArrowLeft, ExternalLink, ShieldAlert } from 'lucide-react';
import { getAttendanceStream } from './actions';

export const dynamic = 'force-dynamic';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function HQGuardProxyPage() {
  const stream = await getAttendanceStream(60);
  const fieldPwaUrl =
    process.env.NEXT_PUBLIC_FIELD_PWA_URL ?? 'http://127.0.0.1:3001';

  const missedCount = stream.filter(
    (row) =>
      row.actionType === 'CHECK_IN' &&
      (!row.status || row.status === 'PENDING'),
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-8 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 pt-2">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <ShieldAlert className="h-7 w-7 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900 md:text-3xl">
              Check-in stream
            </h1>
            <p className="mt-1 text-sm font-bold uppercase tracking-widest text-slate-500">
              HQ view · geofenced guard attendance
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={fieldPwaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-800 shadow-sm transition-all hover:bg-blue-100"
          >
            <ExternalLink className="h-4 w-4" />
            Open guard app
          </a>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            HQ Hub
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Recent pings
          </p>
          <p className="mt-1 text-3xl font-black text-slate-900">{stream.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
            Pending verification
          </p>
          <p className="mt-1 text-3xl font-black text-amber-900">{missedCount}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
            Guard portal
          </p>
          <p className="mt-2 text-xs font-medium text-blue-900">
            Guards clock in on the field PWA with GPS + selfie verification.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-3">Guard</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Device time</th>
              <th className="px-4 py-3">Sync</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stream.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No attendance logs yet. Guards use the check-in app to start shifts.
                </td>
              </tr>
            ) : (
              stream.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">
                      {row.guardName ?? row.empNumber}
                    </p>
                    <p className="font-mono text-[10px] text-slate-500">{row.empNumber}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        row.actionType === 'CHECK_IN'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {row.actionType.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {formatWhen(row.deviceTime)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {row.syncType ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold uppercase text-slate-600">
                    {row.status ?? 'PENDING'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
