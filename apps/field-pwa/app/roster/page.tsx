'use client';

import { useState, useTransition } from 'react';
import { cloneYesterdayRoster, requestEmergencyGuard } from '../actions/roster';
import { Copy, AlertTriangle, CheckCircle } from 'lucide-react';

type Guard = {
  id: string;
  name: string;
  rank: string;
  isAssignedElsewhere: boolean;
};

type ShiftSlot = {
  id: string;
  requiredRank: string;
  assignedGuardId: string | null;
  isShort: boolean;
};

const MOCK_GUARDS: Guard[] = [
  { id: 'g1', name: 'PERERA, K.', rank: 'SSO', isAssignedElsewhere: false },
  { id: 'g2', name: 'FERNANDO, M.', rank: 'JSO', isAssignedElsewhere: false },
  { id: 'g3', name: 'SILVA, D.', rank: 'SSO', isAssignedElsewhere: true },
  { id: 'g4', name: 'BANDARA, R.', rank: 'OIC', isAssignedElsewhere: false },
];

const MOCK_SLOTS: ShiftSlot[] = [
  { id: 's1', requiredRank: 'OIC', assignedGuardId: null, isShort: false },
  { id: 's2', requiredRank: 'SSO', assignedGuardId: null, isShort: false },
  { id: 's3', requiredRank: 'JSO', assignedGuardId: null, isShort: false },
];

export default function MobileRosterPage() {
  const [isPending, startTransition] = useTransition();
  const [activeSiteId] = useState('site-123');
  const [targetDate] = useState(new Date().toISOString().split('T')[0]);

  const [slots, setSlots] = useState<ShiftSlot[]>(MOCK_SLOTS);
  const [activeRankTab, setActiveRankTab] = useState<string>('ALL');

  const handleCloneYesterday = () => {
    startTransition(async () => {
      try {
        const result = await cloneYesterdayRoster(activeSiteId, targetDate);
        if (result.success) {
          alert('✅ Roster Cloned Successfully');
        } else {
          alert('⚠️ ' + result.message);
        }
      } catch {
        alert('Failed to clone roster.');
      }
    });
  };

  const handleEmergencyRequest = (rank: string) => {
    startTransition(async () => {
      try {
        const result = await requestEmergencyGuard(
          'sector-A',
          activeSiteId,
          rank
        );
        alert(result.success ? '🚨 Request sent to OM!' : 'Failed to send request.');
      } catch {
        alert('Error sending emergency request.');
      }
    });
  };

  const assignGuard = (slotId: string, guardId: string | 'SHORT') => {
    setSlots(
      slots.map((s) => {
        if (s.id === slotId) {
          return {
            ...s,
            assignedGuardId: guardId === 'SHORT' ? null : guardId,
            isShort: guardId === 'SHORT',
          };
        }
        return s;
      })
    );
  };

  const getFilteredGuards = (requiredRank: string) => {
    const rankFiltered = MOCK_GUARDS.filter((g) =>
      activeRankTab === 'ALL' ? g.rank === requiredRank : g.rank === activeRankTab
    );

    return rankFiltered.sort((a, b) =>
      a.isAssignedElsewhere === b.isAssignedElsewhere
        ? 0
        : a.isAssignedElsewhere
          ? 1
          : -1
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-slate-200 p-4 font-sans pb-24">
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">
            Site Roster
          </h1>
          <p className="text-emerald-500 text-sm font-bold">{targetDate}</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCloneYesterday}
            disabled={isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Copy className="w-5 h-5" />
            CLONE YESTERDAY
          </button>

          <button
            type="button"
            onClick={() => handleEmergencyRequest('ANY')}
            disabled={isPending}
            className="bg-red-900/50 hover:bg-red-600 text-red-400 hover:text-white border border-red-800/50 py-3 px-4 rounded-lg font-bold flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <AlertTriangle className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-4 mb-2 no-scrollbar">
        <div className="flex gap-2">
          {['ALL', 'OIC', 'SSO', 'JSO', 'LSO'].map((rank) => (
            <button
              key={rank}
              type="button"
              onClick={() => setActiveRankTab(rank)}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                activeRankTab === rank
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-900 text-slate-400 border border-neutral-800'
              }`}
            >
              {rank}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="bg-neutral-800 text-slate-300 px-2 py-1 rounded text-xs font-bold uppercase tracking-widest">
                Req: {slot.requiredRank}
              </span>
              {slot.isShort && (
                <span className="text-red-500 font-bold text-sm flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> SHORT
                </span>
              )}
              {slot.assignedGuardId && (
                <span className="text-emerald-500 font-bold text-sm flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> FILLED
                </span>
              )}
            </div>

            <select
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white appearance-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              value={slot.isShort ? 'SHORT' : slot.assignedGuardId || ''}
              onChange={(e) => assignGuard(slot.id, e.target.value)}
            >
              <option value="" disabled>
                Select Guard...
              </option>
              <option value="SHORT" className="text-red-500 font-bold">
                ⚠️ MARK AS SHORT (VACANT)
              </option>
              {getFilteredGuards(slot.requiredRank).map((guard) => (
                <option
                  key={guard.id}
                  value={guard.id}
                  className={
                    guard.isAssignedElsewhere ? 'text-slate-600 italic' : 'text-white'
                  }
                >
                  {guard.name}{' '}
                  {guard.isAssignedElsewhere ? '(Assigned)' : ''}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="w-full mt-8 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-black text-lg tracking-widest uppercase transition-colors shadow-[0_0_20px_rgba(37,99,235,0.3)]"
      >
        Submit Roster
      </button>
    </div>
  );
}
