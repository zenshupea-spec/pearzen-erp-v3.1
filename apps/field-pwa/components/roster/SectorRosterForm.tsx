'use client';

import { useState, useEffect } from 'react';
import { getSectorGuards, getYesterdayRoster, submitRoster } from '@/app/actions/roster-actions';

type Guard = { id: string; first_name: string; last_name: string; rank_enum: string };
type Shift = { guard_id: string; shift_start: string; shift_end: string };

const RANK_WEIGHTS: Record<string, number> = { OIC: 1, SSO: 2, JSO: 3, TRAINEE: 4 };

export default function SectorRosterForm({
  sectorId,
  companyId,
}: {
  sectorId: string;
  companyId: string;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [shiftDate, setShiftDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [guards, setGuards] = useState<Guard[]>([]);
  const [overlaps, setOverlaps] = useState<Shift[]>([]);
  const [roster, setRoster] = useState<{ guard_id: string; shift_type: string }[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Initialize Data
  useEffect(() => {
    async function loadGuards() {
      if (step === 2) {
        setIsLoading(true);
        const data = await getSectorGuards(sectorId, shiftDate);
        setGuards(data.guards);
        setOverlaps(data.overlappingShifts);
        setIsLoading(false);
      }
    }
    loadGuards();
  }, [step, sectorId, shiftDate]);

  // Action: Clone Yesterday
  const handleCloneYesterday = async () => {
    setIsLoading(true);
    const yesterdayData = await getYesterdayRoster(sectorId, shiftDate);
    if (yesterdayData) {
      setRoster(
        yesterdayData.map((d) => ({
          guard_id: d.guard_id,
          shift_type: d.shift_type,
        }))
      );
    }
    setIsLoading(false);
  };

  // Smart Sorting Logic
  const getSortedGuards = () => {
    return [...guards].sort((a, b) => {
      const aOverlaps = overlaps.some((o) => o.guard_id === a.id);
      const bOverlaps = overlaps.some((o) => o.guard_id === b.id);

      if (aOverlaps && !bOverlaps) return 1; // Push overlaps to bottom
      if (!aOverlaps && bOverlaps) return -1;

      // Secondary sort by Rank
      return (RANK_WEIGHTS[a.rank_enum] || 99) - (RANK_WEIGHTS[b.rank_enum] || 99);
    });
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    const payload = roster.map((r) => ({
      ...r,
      sector_id: sectorId,
      shift_date: shiftDate,
      company_id: companyId,
    }));
    await submitRoster(payload);
    setIsLoading(false);
    alert('Roster Synced to Head Office');
  };

  return (
    <div className="min-h-screen p-4 bg-slate-900 text-slate-100 flex flex-col items-center">
      {/* Glassmorphism Container */}
      <div className="w-full max-w-md bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl rounded-3xl p-6">
        
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-2xl font-semibold tracking-tight">Select Date</h2>
            <input 
              type="date" 
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <button 
              type="button"
              onClick={() => setStep(2)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl p-4 font-medium transition-all"
            >
              Next: Assign Guards
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h2 className="text-xl font-semibold">Deploy Roster</h2>
              <button 
                type="button"
                onClick={handleCloneYesterday}
                className="text-sm bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 px-3 py-2 rounded-lg transition-colors border border-blue-500/30"
              >
                {isLoading ? 'Cloning...' : '↻ Clone Yesterday'}
              </button>
            </div>

            {/* Smart Dropdown Simulation */}
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              {getSortedGuards().map(guard => {
                const isOverlapping = overlaps.some(o => o.guard_id === guard.id)
                const isSelected = roster.some(r => r.guard_id === guard.id)

                return (
                  <div 
                    key={guard.id}
                    onClick={() => {
                      if (isOverlapping) return; // Prevent selection if overlapping
                      setRoster(prev => 
                        isSelected ? prev.filter(p => p.guard_id !== guard.id) 
                        : [...prev, { guard_id: guard.id, shift_type: 'Day' }]
                      )
                    }}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer
                      ${isSelected ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-black/20 border-white/5 hover:border-white/20'}
                      ${isOverlapping ? 'opacity-40 cursor-not-allowed grayscale' : ''}
                    `}
                  >
                    <div>
                      <p className="font-medium">{guard.first_name} {guard.last_name}</p>
                      <p className="text-xs text-slate-400">{guard.rank_enum}</p>
                    </div>
                    {isOverlapping && <span className="text-xs text-red-400 font-semibold px-2 py-1 bg-red-500/10 rounded-md">Conflict</span>}
                    {isSelected && <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></span>}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setStep(1)} className="flex-1 bg-white/5 hover:bg-white/10 rounded-xl p-4 transition-all">Back</button>
              <button type="button" onClick={handleSubmit} disabled={isLoading || roster.length === 0} className="flex-[2] w-2/3 bg-emerald-500 disabled:opacity-50 hover:bg-emerald-600 rounded-xl p-4 font-medium transition-all">
                {isLoading ? 'Syncing...' : 'Lock & Sync'}
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  )
}