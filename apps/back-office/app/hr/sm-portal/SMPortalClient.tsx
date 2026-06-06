'use client'

import { useState, useTransition } from 'react';
import { provisionSMPortalAccess } from './actions';
import { KeyRound, RefreshCw, Copy, CheckCircle } from 'lucide-react';

export interface SectorManagerRow {
  epf_number: string;
  full_name: string;
  site: string;
}

interface GeneratedOTP {
  otp: string;
  epf: string;
  smName: string;
}

export default function SMPortalClient({
  managers,
  initialOtp = null,
}: {
  managers: SectorManagerRow[];
  initialOtp?: GeneratedOTP | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [generatingEpf, setGeneratingEpf] = useState<string | null>(null);
  const [generatedOTP, setGeneratedOTP] = useState<GeneratedOTP | null>(initialOtp);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerateOTP = (epf: string) => {
    setErrorMsg('');
    setGeneratedOTP(null);
    setGeneratingEpf(epf);
    startTransition(async () => {
      const result = await provisionSMPortalAccess(epf);
      setGeneratingEpf(null);
      if (result.error) {
        setErrorMsg(result.error);
      } else if (result.success && result.otp) {
        setGeneratedOTP({
          otp: result.otp,
          epf: result.epf!,
          smName: result.smName!,
        });
      }
    });
  };

  const copyOTP = () => {
    if (!generatedOTP) return;
    navigator.clipboard.writeText(generatedOTP.otp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-slate-600 leading-relaxed">
        Generate a one-time password for a sector manager and share it with them. They use it on first
        SM portal login to set their 6-digit PIN, or again if they forgot their PIN and need a reset.
      </p>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {errorMsg}
        </div>
      )}

      {generatedOTP && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-900">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span className="font-bold text-sm">
              OTP for {generatedOTP.smName} ({generatedOTP.epf})
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3">
            <span className="text-3xl font-black font-mono text-amber-700 tracking-[0.25em] flex-1">
              {generatedOTP.otp}
            </span>
            <button
              type="button"
              onClick={copyOTP}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 transition-all active:scale-95"
            >
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs font-semibold text-amber-800">
            Share this code with {generatedOTP.smName} only. It is shown once and is not stored for HR to
            view again.
            {initialOtp ? ' Auto-provisioned from onboarding.' : ''}
          </p>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <KeyRound className="w-5 h-5 text-amber-600" />
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">
            Sector managers ({managers.length})
          </h2>
        </div>

        {managers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
            <KeyRound className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-bold">No active sector managers found</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {managers.map((sm) => {
              const isGenerating = isPending && generatingEpf === sm.epf_number;
              return (
                <li
                  key={sm.epf_number}
                  className="flex flex-wrap items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{sm.full_name}</p>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">{sm.epf_number}</p>
                    {sm.site !== '—' && (
                      <p className="text-xs font-semibold text-slate-400 mt-0.5 uppercase">{sm.site}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateOTP(sm.epf_number)}
                    disabled={isPending}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    {isGenerating ? 'Generating…' : 'Generate OTP'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
