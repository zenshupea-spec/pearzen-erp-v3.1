'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { appendHrSectorName } from './hr-sector-actions';
import { normalizeHrSectorName } from '../../lib/hr-sectors';

export type HrSectorSelectFieldProps = {
  name: string;
  sectorNames: string[];
  onSectorNamesUpdated: (names: string[]) => void;
  value: string;
  onChange: (sectorName: string) => void;
  disabled?: boolean;
  selectClassName?: string;
};

export default function HrSectorSelectField({
  name,
  sectorNames,
  onSectorNamesUpdated,
  value,
  onChange,
  disabled = false,
  selectClassName,
}: HrSectorSelectFieldProps) {
  const router = useRouter();
  const [addingSector, setAddingSector] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [addSectorError, setAddSectorError] = useState('');
  const [addSectorSaving, setAddSectorSaving] = useState(false);

  const options = useMemo(
    () => [...sectorNames].sort((a, b) => a.localeCompare(b)),
    [sectorNames],
  );

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === '__add_sector__') {
      setAddingSector(true);
      setAddSectorError('');
      return;
    }
    setAddingSector(false);
    onChange(next);
  };

  const handleAddSector = async () => {
    setAddSectorError('');
    setAddSectorSaving(true);
    try {
      const result = await appendHrSectorName({ sectorName: newSectorName });
      if (!result.success) {
        setAddSectorError(result.error ?? 'Could not add sector.');
        return;
      }
      onSectorNamesUpdated(result.sectorNames);
      setAddingSector(false);
      setNewSectorName('');
      onChange(result.sectorName);
      router.refresh();
    } catch (err) {
      setAddSectorError(err instanceof Error ? err.message : 'Could not add sector.');
    } finally {
      setAddSectorSaving(false);
    }
  };

  const inputClass =
    'w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase';

  return (
    <>
      <select
        name={addingSector ? undefined : name}
        required={!addingSector}
        disabled={disabled || addingSector}
        value={addingSector ? '' : value}
        onChange={handleSelectChange}
        className={selectClassName}
      >
        <option value="" disabled>
          Select sector…
        </option>
        {options.map((sector) => (
          <option key={sector} value={sector}>
            {sector}
          </option>
        ))}
        <option value="__add_sector__">+ Add new sector…</option>
      </select>

      {addingSector ? (
        <div className="mt-2 space-y-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-teal-900">
            New sector name
          </p>
          <input
            type="text"
            value={newSectorName}
            onChange={(e) => setNewSectorName(normalizeHrSectorName(e.target.value))}
            placeholder="e.g. GALLE"
            maxLength={48}
            className={inputClass}
          />
          {addSectorError ? (
            <p className="text-[10px] font-semibold text-rose-700">{addSectorError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={addSectorSaving || !newSectorName.trim()}
              onClick={() => void handleAddSector()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
            >
              {addSectorSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Add to list
            </button>
            <button
              type="button"
              disabled={addSectorSaving}
              onClick={() => {
                setAddingSector(false);
                setAddSectorError('');
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
        Sector auto-fills on Executive Sites when this SM is assigned to client sites.
      </p>
    </>
  );
}
