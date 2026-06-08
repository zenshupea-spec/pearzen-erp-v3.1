'use client';

import { useEffect, useState, useTransition } from 'react';

import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import { getCafeFrontDashboard, submitCafeMenuRequest } from '../../app/cafe-front/actions';

type Tab = 'change' | 'add';

export function MenuRequestPanel() {
  const [tab, setTab] = useState<Tab>('change');
  const [menuItems, setMenuItems] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemNotes, setNewItemNotes] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getCafeFrontDashboard().then((payload) => {
      setMenuItems(
        (payload.menuItems ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
        })),
      );
      if (payload.menuCategories?.[0]) setNewItemCategory(payload.menuCategories[0]);
    });
  }, []);

  const submit = () => {
    setMessage(null);
    startTransition(async () => {
      if (tab === 'change') {
        if (!selectedItemId || !changeNotes.trim()) return;
        const item = menuItems.find((row) => row.id === selectedItemId);
        const result = await submitCafeMenuRequest({
          requestType: 'CHANGE_ITEM',
          menuItemId: selectedItemId,
          payload: {
            itemName: item?.name,
            requestedChange: changeNotes.trim(),
          },
          availableUntil: permanent ? undefined : availableUntil || undefined,
          permanent,
        });
        setMessage(result.ok ? 'Change request sent to MD for approval.' : result.error ?? 'Failed');
        if (result.ok) setChangeNotes('');
      } else {
        if (!newItemName.trim()) return;
        const result = await submitCafeMenuRequest({
          requestType: 'ADD_ITEM',
          payload: {
            name: newItemName.trim(),
            category: newItemCategory,
            notes: newItemNotes.trim(),
          },
          availableUntil: permanent ? undefined : availableUntil || undefined,
          permanent,
        });
        setMessage(result.ok ? 'Add-item request sent to MD for approval.' : result.error ?? 'Failed');
        if (result.ok) {
          setNewItemName('');
          setNewItemNotes('');
        }
      }
    });
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold uppercase text-slate-800">Menu Requests</h2>
            <p className="mt-1 text-xs text-slate-500">
              Staff cannot edit prices directly — submit changes or new items for MD approval.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-1">
          {(['change', 'add'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                tab === key ? 'bg-slate-900 text-white' : 'bg-white/70 text-slate-600'
              }`}
            >
              {key === 'change' ? 'Change on item' : 'Request to add item'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={permanent}
              onChange={() => setPermanent(true)}
            />
            Permanent menu change
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={!permanent}
              onChange={() => setPermanent(false)}
            />
            Limited until date
          </label>
          {!permanent ? (
            <input
              type="date"
              value={availableUntil}
              onChange={(e) => setAvailableUntil(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1"
            />
          ) : null}
        </div>

        {tab === 'change' ? (
          <div className="space-y-3">
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select menu item</option>
              {menuItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.category}
                </option>
              ))}
            </select>
            <textarea
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              placeholder="Describe the change (price, recipe, availability, etc.)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              rows={4}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="New item name"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
              placeholder="Category"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <textarea
              value={newItemNotes}
              onChange={(e) => setNewItemNotes(e.target.value)}
              placeholder="Ingredients, portion, suggested price, etc."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              rows={4}
            />
          </div>
        )}

        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40"
        >
          Submit request
        </button>

        {message ? (
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
            {message}
          </p>
        ) : null}
      </div>
    </ExecutiveGlassCard>
  );
}
