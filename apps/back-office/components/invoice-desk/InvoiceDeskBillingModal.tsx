'use client';

import React, { useState, useEffect } from 'react';
import { X, Building2, Users, Plus, Save } from 'lucide-react';
import {
  type InvoiceBillingClient,
  type SupplierInvoiceProfile,
  DEFAULT_SUPPLIER_PROFILE,
} from '../../lib/invoice-desk/types';

type Tab = 'clients' | 'supplier';

interface Props {
  open: boolean;
  onClose: () => void;
  clients: InvoiceBillingClient[];
  supplier: SupplierInvoiceProfile;
  onSaveClients: (clients: InvoiceBillingClient[]) => void;
  onSaveSupplier: (supplier: SupplierInvoiceProfile) => void;
}

function emptyClientDraft(): InvoiceBillingClient {
  const id = `C${String(Date.now()).slice(-4)}`;
  return {
    clientId: id,
    clientName: '',
    sector: '',
    address: '',
    purchaserTin: '',
    invoiceContactName: '',
    invoiceContactPhone: '',
  };
}

export function InvoiceDeskBillingModal({
  open,
  onClose,
  clients,
  supplier,
  onSaveClients,
  onSaveSupplier,
}: Props) {
  const [tab, setTab] = useState<Tab>('clients');
  const [localClients, setLocalClients] = useState<InvoiceBillingClient[]>(clients);
  const [localSupplier, setLocalSupplier] = useState<SupplierInvoiceProfile>(supplier);
  const [selectedId, setSelectedId] = useState<string | null>(clients[0]?.clientId ?? null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocalClients(clients);
    setLocalSupplier(supplier);
    setSelectedId(clients[0]?.clientId ?? null);
    setIsAdding(false);
    setTab('clients');
  }, [open, clients, supplier]);

  if (!open) return null;

  const selected =
    localClients.find((c) => c.clientId === selectedId) ??
    (isAdding ? localClients[localClients.length - 1] : null);

  const updateSelected = (patch: Partial<InvoiceBillingClient>) => {
    if (!selected) return;
    setLocalClients((prev) =>
      prev.map((c) => (c.clientId === selected.clientId ? { ...c, ...patch } : c)),
    );
  };

  const handleAddClient = () => {
    const draft = emptyClientDraft();
    setLocalClients((prev) => [...prev, draft]);
    setSelectedId(draft.clientId);
    setIsAdding(true);
  };

  const handleSaveAll = () => {
    onSaveClients(localClients.filter((c) => c.clientName.trim().length > 0));
    onSaveSupplier(localSupplier);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-sky-950/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-sky-100 bg-gradient-to-r from-sky-50 to-indigo-50 px-6 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">
              Invoice Desk · Executive Admin
            </p>
            <h2 className="text-lg font-black text-slate-900">Clients &amp; Tax Invoice Letterhead</h2>
            <p className="mt-1 text-xs text-slate-600">
              Purchaser details appear on each tax invoice. Supplier letterhead is saved to MD Settings and used on every print.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-6 pt-3">
          <button
            type="button"
            onClick={() => setTab('clients')}
            className={`flex items-center gap-2 rounded-t-xl px-4 py-2 text-xs font-black uppercase tracking-wider ${
              tab === 'clients'
                ? 'border border-b-white border-slate-200 bg-white text-sky-800'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Clients ({localClients.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('supplier')}
            className={`flex items-center gap-2 rounded-t-xl px-4 py-2 text-xs font-black uppercase tracking-wider ${
              tab === 'supplier'
                ? 'border border-b-white border-slate-200 bg-white text-indigo-800'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Our Company (Supplier)
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'clients' ? (
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="md:w-44 flex-shrink-0 space-y-1">
                {localClients.map((c) => (
                  <button
                    key={c.clientId}
                    type="button"
                    onClick={() => {
                      setSelectedId(c.clientId);
                      setIsAdding(false);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors ${
                      selectedId === c.clientId
                        ? 'border-sky-400 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {c.clientName || '(New client)'}
                    <span className="mt-0.5 block font-normal text-[10px] text-slate-500">{c.sector || '—'}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddClient}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-sky-300 py-2 text-[10px] font-black uppercase tracking-wider text-sky-700 hover:bg-sky-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Client
                </button>
              </div>

              {selected ? (
                <div className="min-w-0 flex-1 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                  <Field label="Client / Company Name" value={selected.clientName} onChange={(v) => updateSelected({ clientName: v })} />
                  <Field label="Branch / Site Label" value={selected.sector} onChange={(v) => updateSelected({ sector: v })} />
                  <Field label="Address (for invoice)" value={selected.address} onChange={(v) => updateSelected({ address: v })} multiline />
                  <Field label="Purchaser's TIN" value={selected.purchaserTin} onChange={(v) => updateSelected({ purchaserTin: v })} />
                  <Field label="Invoice Contact Name" value={selected.invoiceContactName} onChange={(v) => updateSelected({ invoiceContactName: v })} />
                  <Field label="Invoice Contact Telephone" value={selected.invoiceContactPhone} onChange={(v) => updateSelected({ invoiceContactPhone: v })} />
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a client or add a new one.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                Supplier block (top of tax invoice)
              </p>
              <Field label="Trading Name" value={localSupplier.tradingName} onChange={(v) => setLocalSupplier((s) => ({ ...s, tradingName: v }))} />
              <Field label="Head Office" value={localSupplier.headOffice} onChange={(v) => setLocalSupplier((s) => ({ ...s, headOffice: v }))} />
              <Field label="Address" value={localSupplier.supplierAddress} onChange={(v) => setLocalSupplier((s) => ({ ...s, supplierAddress: v }))} multiline />
              <Field label="Telephone" value={localSupplier.telephone} onChange={(v) => setLocalSupplier((s) => ({ ...s, telephone: v }))} />
              <Field label="Email" value={localSupplier.email} onChange={(v) => setLocalSupplier((s) => ({ ...s, email: v }))} />
              <Field label="PV No." value={localSupplier.pvNumber} onChange={(v) => setLocalSupplier((s) => ({ ...s, pvNumber: v }))} />
              <Field label="Supplier's TIN" value={localSupplier.supplierTin} onChange={(v) => setLocalSupplier((s) => ({ ...s, supplierTin: v }))} />
              <button
                type="button"
                onClick={() => setLocalSupplier(DEFAULT_SUPPLIER_PROFILE)}
                className="text-[10px] font-bold text-slate-500 underline hover:text-slate-800"
              >
                Reset supplier fields to defaults
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:from-sky-500 hover:to-indigo-500"
          >
            <Save className="h-4 w-4" />
            Save &amp; Apply to Invoices
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-600">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
        />
      )}
    </div>
  );
}
