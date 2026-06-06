'use client';

import { useState, useTransition } from 'react';
import { createRoster } from '../../actions/time-engine';

type Employee = { id: string; emp_number: string; full_name: string };
type Site = { id: string; site_name: string };

type SiteProfilesEmbed = { site_name: string } | { site_name: string }[] | null;

type Roster = {
  id: string;
  shift_date: string;
  planned_start_time: string;
  planned_end_time: string;
  status: string;
  employees: { emp_number: string; full_name: string };
  site_profiles: SiteProfilesEmbed;
};

function siteNameFromRoster(roster: Roster): string {
  const sp = roster.site_profiles;
  if (!sp) return '—';
  if (Array.isArray(sp)) return sp[0]?.site_name ?? '—';
  return sp.site_name ?? '—';
}

interface RosterGridProps {
  employees: Employee[];
  sites: Site[];
  initialRosters: Roster[];
  isDemo?: boolean;
}

export default function RosterGrid({ employees, sites, initialRosters, isDemo = false }: RosterGridProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    employee_id: '',
    site_id: '',
    shift_date: '',
    start_time: '',
    end_time: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (
      !formData.employee_id ||
      !formData.site_id ||
      !formData.shift_date ||
      !formData.start_time ||
      !formData.end_time
    ) {
      setErrorMsg('ALL FIELDS ARE STRICTLY REQUIRED.');
      return;
    }

    startTransition(async () => {
      if (isDemo) {
        setErrorMsg('PREVIEW MODE — ROSTER SAVE DISABLED UNTIL LIVE DATA EXISTS.');
        return;
      }
      try {
        const planned_start_time = new Date(
          `${formData.shift_date}T${formData.start_time}:00`
        ).toISOString();

        let endDateTime = new Date(`${formData.shift_date}T${formData.end_time}:00`);
        if (formData.end_time <= formData.start_time) {
          endDateTime.setDate(endDateTime.getDate() + 1);
        }
        const planned_end_time = endDateTime.toISOString();

        await createRoster({
          employee_id: formData.employee_id,
          site_id: formData.site_id,
          shift_date: formData.shift_date,
          planned_start_time,
          planned_end_time,
        });

        setFormData((prev) => ({
          ...prev,
          employee_id: '',
          start_time: '',
          end_time: '',
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'FAILED TO ASSIGN SHIFT.';
        setErrorMsg(message);
      }
    });
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="col-span-1 bg-white border border-slate-200 p-6 rounded-xl shadow-sm h-fit">
        <h2 className="text-xl font-semibold mb-4 text-emerald-700">Assign Shift</h2>

        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              DATE (ORIGIN RULE)
            </label>
            <input
              type="date"
              name="shift_date"
              value={formData.shift_date}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-emerald-400 uppercase"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">SITE</label>
            <select
              name="site_id"
              value={formData.site_id}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-emerald-400 uppercase"
              required
            >
              <option value="">-- SELECT SITE --</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.site_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">EMPLOYEE</label>
            <select
              name="employee_id"
              value={formData.employee_id}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-emerald-400 uppercase"
              required
            >
              <option value="">-- SELECT GUARD --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.emp_number} - {emp.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                START TIME
              </label>
              <input
                type="time"
                name="start_time"
                value={formData.start_time}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-emerald-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">END TIME</label>
              <input
                type="time"
                name="end_time"
                value={formData.end_time}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-emerald-400"
                required
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg uppercase">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 tracking-wider"
          >
            {isPending ? 'ASSIGNING...' : 'COMMIT SHIFT'}
          </button>
        </form>
      </div>

      <div className="col-span-1 lg:col-span-2 bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex flex-col h-full max-h-[800px]">
        <h2 className="text-xl font-semibold mb-4 text-emerald-700">Master Roster Overview</h2>

        <div className="overflow-auto flex-1 rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Guard</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Shift Time</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialRosters.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-400 uppercase font-semibold tracking-wider"
                  >
                    No shifts assigned yet.
                  </td>
                </tr>
              ) : (
                initialRosters.map((roster) => (
                  <tr key={roster.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{roster.shift_date}</td>
                    <td className="px-4 py-3 uppercase">
                      {roster.employees?.emp_number} - {roster.employees?.full_name}
                    </td>
                    <td className="px-4 py-3 uppercase">{siteNameFromRoster(roster)}</td>
                    <td className="px-4 py-3 text-emerald-700 font-mono text-xs">
                      {formatTime(roster.planned_start_time)} -{' '}
                      {formatTime(roster.planned_end_time)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${
                          roster.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {roster.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
