'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getCafeStaff,
  getWeeklyRoster,
  applyMasterLayoutAction,
  updateShiftException,
} from '../../app/actions/cafe-roster-actions';

type Staff = { id: string; first_name: string; last_name: string };
type Shift = {
  id: string;
  guard_id: string;
  shift_date: string;
  shift_type: 'Morning' | 'Evening';
};

const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const SHIFT_TYPES = ['Morning', 'Evening'] as const;

function buildWeekDates(weekStartDate: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

export default function CafeWeeklyRoster({
  cafeId,
  companyId,
  weekStartDate,
}: {
  cafeId: string;
  companyId: string;
  weekStartDate: string;
}) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const weekDates = useMemo(
    () => buildWeekDates(weekStartDate),
    [weekStartDate]
  );
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      try {
        const [staffData, rosterData] = await Promise.all([
          getCafeStaff(cafeId),
          getWeeklyRoster(cafeId, weekStart, weekEnd),
        ]);
        if (cancelled) return;
        setStaff(staffData as Staff[]);
        setShifts(rosterData as Shift[]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [cafeId, weekStart, weekEnd]);

  const handleApplyMaster = async () => {
    if (
      !confirm(
        'This will auto-fill the week using the Master Layout. Proceed?'
      )
    ) {
      return;
    }
    setIsLoading(true);
    try {
      await applyMasterLayoutAction(cafeId, companyId, weekDates);
      const freshRoster = await getWeeklyRoster(cafeId, weekStart, weekEnd);
      setShifts(freshRoster as Shift[]);
    } catch {
      alert('Error applying layout. Ensure Master Layout is configured.');
    }
    setIsLoading(false);
  };

  const handleDragStart = (e: React.DragEvent, shiftId: string) => {
    e.dataTransfer.setData('shiftId', shiftId);
  };

  const handleDrop = async (
    e: React.DragEvent,
    targetDate: string,
    targetType: string
  ) => {
    e.preventDefault();
    const shiftId = e.dataTransfer.getData('shiftId');
    if (!shiftId) return;

    setShifts((prev) =>
      prev.map((s) =>
        s.id === shiftId
          ? {
              ...s,
              shift_date: targetDate,
              shift_type: targetType as Shift['shift_type'],
            }
          : s
      )
    );

    try {
      await updateShiftException(shiftId, targetDate, targetType);
    } catch {
      alert('Failed to update exception. Reverting.');
      const freshRoster = await getWeeklyRoster(cafeId, weekStart, weekEnd);
      setShifts(freshRoster as Shift[]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const getStaffName = (id: string) => {
    const person = staff.find((s) => s.id === id);
    return person ? `${person.first_name} ${person.last_name}` : 'Unknown';
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-800">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Weekly Cafe Roster
          </h1>
          <p className="text-slate-500 mt-1">Week of {weekDates[0]}</p>
        </div>
        <button
          type="button"
          onClick={handleApplyMaster}
          disabled={isLoading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg shadow-sm font-semibold transition-all disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : '⚡ Apply Master Layout'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-100/50">
          <div className="p-4 font-semibold text-slate-500 border-r border-slate-200">
            Shift
          </div>
          {WEEK_DAYS.map((day, i) => (
            <div
              key={day}
              className="p-4 font-semibold text-center border-r border-slate-200 last:border-0"
            >
              <div className="text-slate-900">{day}</div>
              <div className="text-sm text-slate-500 font-normal">
                {weekDates[i]}
              </div>
            </div>
          ))}
        </div>

        {SHIFT_TYPES.map((shiftType) => (
          <div
            key={shiftType}
            className="grid grid-cols-8 border-b border-slate-200 last:border-0"
          >
            <div className="p-4 flex items-center justify-center font-medium bg-slate-50 border-r border-slate-200">
              {shiftType}
            </div>
            {weekDates.map((date) => (
              <div
                key={`${date}-${shiftType}`}
                onDrop={(e) => handleDrop(e, date, shiftType)}
                onDragOver={handleDragOver}
                className="p-3 min-h-[120px] border-r border-slate-200 last:border-0 hover:bg-slate-50/50 transition-colors"
              >
                {shifts
                  .filter(
                    (s) => s.shift_date === date && s.shift_type === shiftType
                  )
                  .map((shift) => (
                    <div
                      key={shift.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, shift.id)}
                      className="bg-white border border-slate-200 shadow-sm rounded-md p-2 mb-2 text-sm cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:shadow-md transition-all group"
                    >
                      <div className="font-medium text-slate-700 group-hover:text-indigo-700">
                        {getStaffName(shift.guard_id)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Drag to reassign
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
