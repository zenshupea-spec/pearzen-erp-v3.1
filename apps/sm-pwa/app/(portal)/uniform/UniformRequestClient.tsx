'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Shirt, ArrowLeft, CheckCircle2, Plus, Minus, Trash2, ChevronDown, Camera } from 'lucide-react';
import type { SMAssignmentOption } from '../../../lib/sm-assignments';
import type { UniformCatalogEntry } from '../../../../../packages/uniform-catalog';
import { lookupUniformCost } from '../../../../../packages/uniform-catalog';
import { voStockQuantityMap, type UniformVoStockRow } from '../../../../../packages/uniform-vo-stock';
import { uniformRequestAction } from './actions';

const UNIFORM_ITEMS = [
  'Shirt (Short Sleeve)',
  'Shirt (Long Sleeve)',
  'Trousers',
  'Belt',
  'Cap / Beret',
  'Boots',
  'Jacket / Blouson',
  'Epaulettes',
  'ID Badge / Lanyard',
  'High-Vis Vest',
  'Gloves',
  'Tie',
];

const selectClassName =
  'w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all appearance-none';

function guardNameFromLabel(label: string): string {
  const sep = label.indexOf(' — ');
  return sep >= 0 ? label.slice(sep + 3).trim() : '';
}

interface Item {
  item: string;
  qty: number;
}

interface LineItem extends Item {
  unitCost: number;
  lineTotal: number;
}

function compositeConsentSelfie(
  video: HTMLVideoElement,
  lineItems: LineItem[],
  totalAmount: number,
  requestType: 'ISSUE' | 'REQUEST_REPLACEMENT',
): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const barTop = canvas.height * 0.55;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, barTop, canvas.width, canvas.height - barTop);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#34d399';
  ctx.font = `bold ${Math.max(18, Math.round(canvas.width * 0.045))}px sans-serif`;
  ctx.fillText(
    requestType === 'ISSUE' ? 'UNIFORM ISSUE FROM STOCK' : 'UNIFORM COURIER REQUEST',
    canvas.width / 2,
    barTop + canvas.height * 0.07,
  );

  ctx.font = `bold ${Math.max(13, Math.round(canvas.width * 0.032))}px sans-serif`;
  ctx.textAlign = 'left';
  const leftPad = canvas.width * 0.06;
  lineItems.slice(0, 4).forEach((row, i) => {
    const y = barTop + canvas.height * 0.14 + i * (canvas.height * 0.055);
    ctx.fillText(`${row.qty}× ${row.item.toUpperCase()}`, leftPad, y);
    ctx.textAlign = 'right';
    ctx.fillText(`LKR ${row.lineTotal.toLocaleString()}`, canvas.width - leftPad, y);
    ctx.textAlign = 'left';
  });
  if (lineItems.length > 4) {
    ctx.fillText(`+${lineItems.length - 4} MORE ITEMS`, leftPad, barTop + canvas.height * 0.14 + 4 * (canvas.height * 0.055));
  }

  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(20, Math.round(canvas.width * 0.05))}px sans-serif`;
  ctx.fillText(
    `TOTAL: LKR ${totalAmount.toLocaleString()}`,
    canvas.width / 2,
    barTop + canvas.height * 0.38,
  );

  ctx.font = `${Math.max(12, Math.round(canvas.width * 0.028))}px sans-serif`;
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('Guard consent recorded on camera', canvas.width / 2, barTop + canvas.height * 0.48);

  return canvas.toDataURL('image/jpeg', 0.88);
}

function ConsentOverlay({
  lineItems,
  totalAmount,
  totalQty,
  requestType,
  onConfirm,
  isPending,
  cameraReady,
  cameraError,
}: {
  lineItems: LineItem[];
  totalAmount: number;
  totalQty: number;
  requestType: 'ISSUE' | 'REQUEST_REPLACEMENT';
  onConfirm: () => void;
  isPending: boolean;
  cameraReady: boolean;
  cameraError: string;
}) {
  const heading =
    requestType === 'ISSUE'
      ? `Uniform issue — ${totalQty} ${totalQty === 1 ? 'item' : 'items'}`
      : `Courier request — ${totalQty} ${totalQty === 1 ? 'item' : 'items'}`;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-end px-6 pb-10 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-emerald-500/35 bg-black/40 backdrop-blur-sm px-5 py-5 space-y-3 shadow-[0_0_40px_rgba(52,211,153,0.2)]">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600 text-center">
          {heading}
        </p>
        <ul className="space-y-1.5 text-left border-b border-emerald-500/25 pb-3 max-h-36 overflow-y-auto">
          {lineItems.map((row) => (
            <li key={row.item} className="flex items-start justify-between gap-3">
              <span className="text-emerald-600 font-bold text-sm uppercase leading-snug">
                {row.qty}× {row.item}
              </span>
              <span className="text-emerald-600 font-black text-sm tabular-nums whitespace-nowrap">
                LKR {row.lineTotal.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-emerald-600 font-black text-3xl tabular-nums leading-none text-center">
          LKR {totalAmount.toLocaleString()}
        </p>
        <p className="text-emerald-300/90 text-xs uppercase tracking-wide text-center">
          {cameraReady ? 'Guard must confirm on camera' : 'Starting front camera…'}
        </p>
        {cameraError && (
          <p className="text-red-600 text-sm font-bold text-center">{cameraError}</p>
        )}
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending || !cameraReady}
          className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition-all"
        >
          {isPending ? 'Submitting…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

function UniformSuccessModal({
  guardName,
  lineItems,
  totalAmount,
  totalQty,
  requestType,
  warning,
  onDashboard,
}: {
  guardName: string;
  lineItems: LineItem[];
  totalAmount: number;
  totalQty: number;
  requestType: 'ISSUE' | 'REQUEST_REPLACEMENT';
  warning?: string;
  onDashboard: () => void;
}) {
  const isIssue = requestType === 'ISSUE';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-5"
      role="dialog"
      aria-modal="true"
      aria-label="Uniform confirmation"
    >
      <div className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-white p-6 space-y-5 shadow-[0_0_60px_rgba(52,211,153,0.15)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">
              {isIssue ? 'Issued from stock' : 'Courier request submitted'}
            </p>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-snug">
              {isIssue ? `Issued to ${guardName}` : `Requested for ${guardName}`}
            </h2>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-2">
          <p className="text-sm font-black uppercase tracking-widest text-slate-600">
            {totalQty} {totalQty === 1 ? 'item' : 'items'}
          </p>
          <ul className="space-y-1">
            {lineItems.map((row) => (
              <li key={row.item} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-emerald-600 font-bold uppercase truncate">{row.qty}× {row.item}</span>
                <span className="text-emerald-600 font-black tabular-nums whitespace-nowrap">
                  LKR {row.lineTotal.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-emerald-600 font-black text-xl tabular-nums pt-1 border-t border-emerald-500/20">
            LKR {totalAmount.toLocaleString()}
          </p>
          <p className="text-sm text-slate-500 uppercase tracking-wide">
            {isIssue ? 'Queued for payroll deduction' : 'Sent to admin for courier dispatch'}
          </p>
        </div>

        {warning && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-3 rounded-xl text-sm text-center font-bold">
            {warning}
          </div>
        )}

        <button
          type="button"
          onClick={onDashboard}
          className="w-full bg-violet-500 hover:bg-violet-400 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all active:scale-95"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}

function applyStockDeduction(
  rows: UniformVoStockRow[],
  issued: Item[],
): UniformVoStockRow[] {
  const map = voStockQuantityMap(rows);
  for (const line of issued) {
    map.set(line.item, Math.max(0, (map.get(line.item) ?? 0) - line.qty));
  }
  return Array.from(map.entries())
    .filter(([, qty]) => qty > 0)
    .map(([itemName, quantityOnHand]) => ({ itemName, quantityOnHand }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export default function UniformRequestClient({
  catalog,
  guards,
  stockOnHand: initialStockOnHand,
}: {
  catalog: UniformCatalogEntry[];
  guards: SMAssignmentOption[];
  stockOnHand: UniformVoStockRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [requestType, setRequestType] = useState<'ISSUE' | 'REQUEST_REPLACEMENT'>('ISSUE');
  const [guardEpf, setGuardEpf] = useState('');
  const [guardName, setGuardName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [stockOnHand, setStockOnHand] = useState(initialStockOnHand);
  const [showItemPicker, setShowItemPicker] = useState(false);

  const stockByItem = useMemo(() => voStockQuantityMap(stockOnHand), [stockOnHand]);

  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [portalMounted, setPortalMounted] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<{
    guardName: string;
    lineItems: LineItem[];
    totalAmount: number;
    totalQty: number;
    requestType: 'ISSUE' | 'REQUEST_REPLACEMENT';
    warning?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => setPortalMounted(true), []);

  const lineItems: LineItem[] = items.map((row) => {
    const unitCost = lookupUniformCost(catalog, row.item);
    return { ...row, unitCost, lineTotal: unitCost * row.qty };
  });
  const totalAmount = lineItems.reduce((sum, row) => sum + row.lineTotal, 0);
  const totalQty = items.reduce((sum, row) => sum + row.qty, 0);

  const closeCameraModal = useCallback(() => {
    setCameraModalOpen(false);
    setCameraReady(false);
  }, []);

  const stopCamera = useCallback(() => {
    const video = videoRef.current;
    if (video?.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    closeCameraModal();
  }, [closeCameraModal]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const openCameraModal = useCallback(() => {
    setCameraError('');
    setCameraReady(false);
    setCameraModalOpen(true);
  }, []);

  useEffect(() => {
    if (!cameraModalOpen) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    const startCamera = async () => {
      // Wait for portal + video element to mount before attaching stream.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled) return;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera not supported in this browser.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          setCameraError('Camera view failed to load. Close and try again.');
          return;
        }

        video.srcObject = stream;
        await video.play();
        if (!cancelled) {
          setCameraError('');
          setCameraReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : 'Camera access denied. Allow camera permission and try again.';
          setCameraError(message);
          setCameraReady(false);
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (video?.srcObject) video.srcObject = null;
      setCameraReady(false);
    };
  }, [cameraModalOpen]);

  useEffect(() => {
    if (!cameraModalOpen && !submitSuccess) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cameraModalOpen, submitSuccess]);

  const submitRequest = useCallback(
    (consentSelfie?: string) => {
      setErrorMsg('');

      const fd = new FormData();
      fd.set('guard_epf', guardEpf.trim().toUpperCase());
      fd.set('guard_name', guardName.trim());
      fd.set('request_type', requestType);
      fd.set('items_json', JSON.stringify(items));
      if (consentSelfie) fd.set('consent_selfie', consentSelfie);

      startTransition(async () => {
        try {
          const result = await uniformRequestAction(fd);
          if (result?.error) {
            setErrorMsg(result.error);
            return;
          }
          if (result?.success) {
            stopCamera();
            if (requestType === 'ISSUE') {
              setStockOnHand((prev) => applyStockDeduction(prev, items));
            }
            setSubmitSuccess({
              guardName: result.guardName ?? (guardName || guardEpf),
              lineItems: [...lineItems],
              totalAmount: result.amount ?? totalAmount,
              totalQty,
              requestType,
              warning: result.warning,
            });
          }
        } catch {
          setErrorMsg('Something went wrong. Please try again.');
        }
      });
    },
    [guardEpf, guardName, requestType, items, lineItems, totalAmount, totalQty, stopCamera, router],
  );

  const captureAndSubmit = useCallback(() => {
    const video = videoRef.current;
    if (!video || items.length === 0) return;

    const dataUrl = compositeConsentSelfie(video, lineItems, totalAmount, requestType);
    if (!dataUrl) {
      setCameraError('Failed to capture consent photo. Please try again.');
      return;
    }

    submitRequest(dataUrl);
  }, [items.length, lineItems, totalAmount, requestType, submitRequest]);

  const maxQtyForItem = useCallback(
    (itemName: string, excludeIndex?: number) => {
      const onHand = stockByItem.get(itemName) ?? 0;
      const inCart = items.reduce(
        (sum, row, i) => (row.item === itemName && i !== excludeIndex ? sum + row.qty : sum),
        0,
      );
      return Math.max(0, onHand - inCart);
    },
    [items, stockByItem],
  );

  const addItem = (itemName: string) => {
    if (items.find(i => i.item === itemName)) return;
    if (requestType === 'ISSUE' && maxQtyForItem(itemName) < 1) {
      setErrorMsg(`No "${itemName}" left on your stock on hand.`);
      return;
    }
    setItems(prev => [...prev, { item: itemName, qty: 1 }]);
    setShowItemPicker(false);
    setErrorMsg('');
  };

  const updateQty = (index: number, delta: number) => {
    setItems(prev =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const nextRaw = it.qty + delta;
        if (requestType === 'ISSUE') {
          const cap = maxQtyForItem(it.item, i);
          return { ...it, qty: Math.max(1, Math.min(nextRaw, cap)) };
        }
        return { ...it, qty: Math.max(1, nextRaw) };
      }),
    );
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleOpenCamera = () => {
    setErrorMsg('');
    setCameraError('');
    if (!guardEpf) {
      setErrorMsg('Please select a guard.');
      return;
    }
    if (items.length === 0) {
      setErrorMsg('Add at least one uniform item.');
      return;
    }
    if (requestType === 'ISSUE') {
      for (const row of items) {
        if (maxQtyForItem(row.item) < row.qty) {
          setErrorMsg(`Not enough "${row.item}" on hand for this issue.`);
          return;
        }
      }
    }
    if (guards.length === 0) {
      setErrorMsg('No guards are assigned to your sector yet.');
      return;
    }
    openCameraModal();
  };

  const cameraModal =
    cameraModalOpen && items.length > 0 ? (
      <div
        className="fixed inset-0 z-[9999] flex flex-col bg-black"
        role="dialog"
        aria-modal="true"
        aria-label="Guard consent camera"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover scale-x-[-1] ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
        />

        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 z-10 bg-black" />
        )}

        <ConsentOverlay
          lineItems={lineItems}
          totalAmount={totalAmount}
          totalQty={totalQty}
          requestType={requestType}
          onConfirm={captureAndSubmit}
          isPending={isPending}
          cameraReady={cameraReady}
          cameraError={cameraError}
        />

        <button
          type="button"
          onClick={stopCamera}
          disabled={isPending}
          className="absolute top-4 left-4 z-30 rounded-xl border border-white/20 bg-black/50 px-4 py-2 text-sm font-bold uppercase tracking-wide text-slate-800 backdrop-blur-sm disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    ) : null;

  return (
    <div className="flex-1 flex flex-col p-5 space-y-6">
      <header className="flex items-center gap-3 pt-2">
        <button onClick={() => router.back()} className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Uniform</h1>
          <p className="text-sm text-slate-500 font-mono">Issue from stock or request courier</p>
        </div>
        <div className="ml-auto p-3 bg-violet-500/10 rounded-xl border border-violet-500/20">
          <Shirt className="w-5 h-5 text-violet-600" />
        </div>
      </header>

      <div className="space-y-5">

        {requestType === 'ISSUE' && (
          <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">
              My stock on hand
            </h2>
            {stockOnHand.length === 0 ? (
              <p className="text-sm text-amber-600/90 font-mono bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                No stock allocated to your EPF yet. Ask HQ to allocate before issuing.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {stockOnHand.map((row) => (
                  <li
                    key={row.itemName}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                  >
                    <span className="block truncate">{row.itemName}</span>
                    <span className="font-mono text-sm text-violet-600 tabular-nums">
                      {row.quantityOnHand} on hand
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Request Type Toggle */}
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Request Type</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'ISSUE', label: 'Issue from Stock', sub: 'From my stock on hand' },
              { value: 'REQUEST_REPLACEMENT', label: 'Request Courier', sub: 'Courier from stores' },
            ].map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setRequestType(t.value as typeof requestType);
                  stopCamera();
                }}
                className={`p-4 rounded-xl border text-left transition-all active:scale-95 ${
                  requestType === t.value
                    ? 'bg-violet-500/15 border-violet-500/50'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className={`text-sm font-black uppercase tracking-tight ${requestType === t.value ? 'text-violet-600' : 'text-slate-700'}`}>
                  {t.label}
                </p>
                <p className="text-sm text-slate-500 font-bold mt-0.5">{t.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Guard Identification */}
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Guard</h2>
          <div>
            <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">
              Guard <span className="text-violet-500">*</span>
            </label>
            {guards.length === 0 ? (
              <p className="text-sm text-amber-600/90 font-mono bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                No guards are assigned to your sector yet. Contact operations to assign guards before submitting a uniform request.
              </p>
            ) : (
              <div className="relative">
                <select
                  required
                  value={guardEpf}
                  onChange={(e) => {
                    const epf = e.target.value;
                    setGuardEpf(epf);
                    const label = guards.find(g => g.value === epf)?.label ?? '';
                    setGuardName(guardNameFromLabel(label));
                    stopCamera();
                  }}
                  className={`${selectClassName} pr-11 ${guardEpf ? 'text-slate-900' : 'text-slate-400'}`}
                >
                  <option value="" disabled>
                    Select a guard
                  </option>
                  {guards.map(guard => (
                    <option key={guard.value} value={guard.value}>
                      {guard.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            )}
          </div>
          {guardName && (
            <p className="text-sm text-slate-500 font-mono">
              Selected: <span className="text-slate-700 font-bold">{guardName}</span>
            </p>
          )}
        </div>

        {/* Items */}
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">
              Items <span className="text-violet-500">*</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowItemPicker(v => !v)}
              className="flex items-center gap-1.5 text-xs font-black text-violet-600 bg-violet-500/10 border border-violet-500/30 px-3 py-1.5 rounded-lg transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>

          {showItemPicker && (
            <div className="grid grid-cols-2 gap-2 bg-white/80 border border-slate-200 rounded-xl p-3">
              {UNIFORM_ITEMS.filter(u => !items.find(i => i.item === u)).map(u => {
                const available = requestType === 'ISSUE' ? maxQtyForItem(u) : 999;
                const disabled = requestType === 'ISSUE' && available < 1;
                return (
                  <button
                    key={u}
                    type="button"
                    disabled={disabled}
                    onClick={() => addItem(u)}
                    className={`p-2.5 rounded-lg border text-xs font-bold text-left transition-all active:scale-95 ${
                      disabled
                        ? 'cursor-not-allowed border-slate-200 text-slate-400'
                        : 'border-slate-200 text-slate-700 hover:bg-violet-500/10 hover:border-violet-500/40 hover:text-violet-600'
                    }`}
                  >
                    {u}
                    {requestType === 'ISSUE' && (
                      <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                        {available} on hand
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm font-bold uppercase">
              No items added yet
            </div>
          ) : (
            <div className="space-y-2">
              {lineItems.map((item, index) => (
                <div key={index} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <div className="min-w-0 flex-1 pr-3">
                    <span className="text-sm font-bold text-slate-800 block truncate">{item.item}</span>
                    {item.unitCost > 0 && (
                      <span className="text-sm font-mono text-slate-500">
                        LKR {item.unitCost.toLocaleString()} each
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQty(index, -1)}
                      className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-black text-slate-900 w-6 text-center tabular-nums">{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(index, 1)}
                      disabled={
                        requestType === 'ISSUE' && item.qty >= maxQtyForItem(item.item, index)
                      }
                      className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-30"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 hover:bg-red-500/20 transition-colors ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary + camera */}
        {items.length > 0 && (
          <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-sm font-black uppercase tracking-widest text-slate-600">
                  {totalQty} {totalQty === 1 ? 'item' : 'items'}
                </p>
                <ul className="space-y-1">
                  {lineItems.map((row) => (
                    <li key={row.item} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-emerald-600/90 font-bold uppercase truncate">{row.qty}× {row.item}</span>
                      <span className="text-emerald-600 font-black tabular-nums whitespace-nowrap">
                        LKR {row.lineTotal.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-emerald-600 font-black text-2xl tabular-nums pt-1">
                  LKR {totalAmount.toLocaleString()}
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenCamera}
                disabled={isPending}
                className="shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-lg shadow-emerald-600/25 transition-all active:scale-95"
                aria-label="Open camera for guard consent"
              >
                <Camera className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
            {errorMsg}
          </div>
        )}

        {cameraError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
            {cameraError}
          </div>
        )}

      </div>

      {portalMounted && cameraModal ? createPortal(cameraModal, document.body) : null}
      {portalMounted && submitSuccess
        ? createPortal(
            <UniformSuccessModal
              guardName={submitSuccess.guardName}
              lineItems={submitSuccess.lineItems}
              totalAmount={submitSuccess.totalAmount}
              totalQty={submitSuccess.totalQty}
              requestType={submitSuccess.requestType}
              warning={submitSuccess.warning}
              onDashboard={() => router.push('/dashboard')}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
