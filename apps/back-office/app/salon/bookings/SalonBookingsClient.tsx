'use client';

import { useEffect, useState, useTransition } from 'react';

import {
  fetchSalonAppointments,
  fetchSalonServices,
  saveSalonAppointment,
} from '../actions';
import type { SalonAppointmentRow, SalonServiceRow } from '../../../lib/salon-types';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-LK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SalonBookingsClient() {
  const [appointments, setAppointments] = useState<SalonAppointmentRow[]>([]);
  const [services, setServices] = useState<SalonServiceRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    clientName: '',
    clientPhone: '',
    serviceId: '',
    scheduledStart: '',
    durationMinutes: 60,
    notes: '',
  });

  const load = async () => {
    try {
      const [appointmentRows, serviceRows] = await Promise.all([
        fetchSalonAppointments(),
        fetchSalonServices(),
      ]);
      setAppointments(appointmentRows);
      setServices(serviceRows.filter((row) => row.isActive));
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load bookings');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await saveSalonAppointment({
        clientName: form.clientName,
        clientPhone: form.clientPhone,
        serviceId: form.serviceId || null,
        scheduledStart: form.scheduledStart,
        durationMinutes: form.durationMinutes,
        notes: form.notes,
      });
      if (!result.success) {
        setMessage(result.error ?? 'Failed to save appointment');
        return;
      }
      setMessage('Appointment saved.');
      setForm({
        clientName: '',
        clientPhone: '',
        serviceId: '',
        scheduledStart: '',
        durationMinutes: 60,
        notes: '',
      });
      await load();
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">Bookings</h1>
        <p className="mt-1 text-sm text-slate-500">Upcoming salon appointments for this tenant.</p>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">New appointment</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <input
            value={form.clientName}
            onChange={(e) => setForm((prev) => ({ ...prev, clientName: e.target.value }))}
            placeholder="Client name"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            value={form.clientPhone}
            onChange={(e) => setForm((prev) => ({ ...prev, clientPhone: e.target.value }))}
            placeholder="Phone"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <select
            value={form.serviceId}
            onChange={(e) => {
              const service = services.find((row) => row.id === e.target.value);
              setForm((prev) => ({
                ...prev,
                serviceId: e.target.value,
                durationMinutes: service?.durationMinutes ?? prev.durationMinutes,
              }));
            }}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          >
            <option value="">Service (optional)</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} · {service.durationMinutes}m
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={form.scheduledStart}
            onChange={(e) => setForm((prev) => ({ ...prev, scheduledStart: e.target.value }))}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            type="number"
            min={15}
            step={15}
            value={form.durationMinutes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, durationMinutes: Number(e.target.value) }))
            }
            placeholder="Duration (minutes)"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Notes"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm md:col-span-2"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="mt-4 rounded-xl bg-rose-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save appointment'}
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {appointments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  No appointments yet.
                </td>
              </tr>
            ) : (
              appointments.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{formatWhen(row.scheduledStart)}</td>
                  <td className="px-4 py-3">
                    <div>{row.clientName}</div>
                    {row.clientPhone ? (
                      <div className="text-xs text-slate-500">{row.clientPhone}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{row.serviceName ?? '—'}</td>
                  <td className="px-4 py-3 uppercase text-xs font-bold text-slate-600">
                    {row.status}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
