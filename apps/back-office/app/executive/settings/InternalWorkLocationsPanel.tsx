'use client';

import { useEffect, useState } from 'react';
import { Building2, Coffee, MapPin, Plus, Trash2 } from 'lucide-react';
import {
  createEmptyInternalWorkLocation,
  type InternalWorkLocation,
  type InternalWorkLocationsSettings,
} from '../../../lib/internal-work-locations';
import {
  formatGpsCoords,
  MAX_GEOFENCE_RADIUS_M,
  MIN_GEOFENCE_RADIUS_M,
  parseGpsCoords,
} from '../../../lib/site-geofence';

type BranchKind = 'headOffice' | 'cafe';

const BRANCH_META: Record<
  BranchKind,
  { title: string; subtitle: string; Icon: typeof Building2; accent: string }
> = {
  headOffice: {
    title: 'Head Office Branches',
    subtitle: 'GPS geofences for HO staff check-in and portal access',
    Icon: Building2,
    accent: 'slate',
  },
  cafe: {
    title: 'Café Branches',
    subtitle: 'GPS geofences for café staff shift check-in',
    Icon: Coffee,
    accent: 'amber',
  },
};

function BranchRow({
  row,
  index,
  kind,
  onUpdate,
  onRemove,
}: {
  row: InternalWorkLocation;
  index: number;
  kind: BranchKind;
  onUpdate: (patch: Partial<InternalWorkLocation>) => void;
  onRemove: () => void;
}) {
  const [gpsText, setGpsText] = useState(() => formatGpsCoords(row.latitude, row.longitude));

  useEffect(() => {
    setGpsText(formatGpsCoords(row.latitude, row.longitude));
  }, [row.id, row.latitude, row.longitude]);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Branch {index + 1}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700 hover:bg-rose-50"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
            Branch name
          </label>
          <input
            value={row.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={kind === 'headOffice' ? 'e.g. Colombo HQ' : 'e.g. Café Tasha — Bambalapitiya'}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
            Address
          </label>
          <input
            value={row.address}
            onChange={(e) => onUpdate({ address: e.target.value })}
            placeholder="Street address, city"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <div className="sm:col-span-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Google Maps coordinates
              </label>
              <div className="relative min-w-0">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={gpsText}
                  onChange={(e) => {
                    const next = e.target.value;
                    setGpsText(next);
                    const { lat, lng } = parseGpsCoords(next);
                    if (lat != null && lng != null) {
                      onUpdate({ latitude: lat, longitude: lng });
                    }
                  }}
                  onBlur={() => {
                    const { lat, lng } = parseGpsCoords(gpsText);
                    onUpdate({
                      latitude: lat ?? 0,
                      longitude: lng ?? 0,
                    });
                    setGpsText(formatGpsCoords(lat ?? 0, lng ?? 0));
                  }}
                  placeholder="e.g., 6.9271, 79.8612"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            </div>
            <div className="w-full shrink-0 lg:w-[140px]">
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Geofence radius (m)
              </label>
              <input
                type="number"
                min={MIN_GEOFENCE_RADIUS_M}
                max={MAX_GEOFENCE_RADIUS_M}
                value={row.geofenceRadiusM}
                onChange={(e) =>
                  onUpdate({
                    geofenceRadiusM: Number.parseInt(e.target.value, 10) || MIN_GEOFENCE_RADIUS_M,
                  })
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BranchBlock({
  kind,
  locations,
  onChange,
}: {
  kind: BranchKind;
  locations: InternalWorkLocation[];
  onChange: (next: InternalWorkLocation[]) => void;
}) {
  const meta = BRANCH_META[kind];
  const Icon = meta.Icon;

  const updateRow = (id: string, patch: Partial<InternalWorkLocation>) => {
    onChange(locations.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    onChange(locations.filter((row) => row.id !== id));
  };

  const addRow = () => {
    onChange([...locations, createEmptyInternalWorkLocation()]);
  };

  return (
    <div
      className={`rounded-2xl border p-5 ${
        kind === 'cafe'
          ? 'border-amber-200/70 bg-amber-50/40'
          : 'border-slate-200/70 bg-slate-50/60'
      }`}
    >
      <div className="mb-4 flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
            kind === 'cafe'
              ? 'border-amber-200/80 bg-amber-100/80 text-amber-700'
              : 'border-slate-200/80 bg-slate-100/80 text-slate-700'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-bold text-slate-800">{meta.title}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-600">{meta.subtitle}</p>
        </div>
      </div>

      {locations.length === 0 ? (
        <p className="mb-3 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-sm font-medium text-slate-500">
          No branches configured yet. Add a branch with name and GPS coordinates.
        </p>
      ) : (
        <div className="space-y-3">
          {locations.map((row, index) => (
            <BranchRow
              key={row.id}
              row={row}
              index={index}
              kind={kind}
              onUpdate={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100/70"
      >
        <Plus className="h-3.5 w-3.5" />
        Add branch
      </button>
    </div>
  );
}

export function InternalWorkLocationsPanel({
  value,
  onChange,
}: {
  value: InternalWorkLocationsSettings;
  onChange: (next: InternalWorkLocationsSettings) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p>
          Configure Classic Venture head office and café branches here. HR assigns staff to a branch in
          MNR; check-in uses that branch&apos;s GPS geofence. Client guard sites stay in the Site Directory.
        </p>
      </div>
      <BranchBlock
        kind="headOffice"
        locations={value.headOffice}
        onChange={(headOffice) => onChange({ ...value, headOffice })}
      />
      <BranchBlock
        kind="cafe"
        locations={value.cafe}
        onChange={(cafe) => onChange({ ...value, cafe })}
      />
    </div>
  );
}
