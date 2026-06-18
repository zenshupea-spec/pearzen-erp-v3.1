'use client'

import { useEffect, useState, useTransition } from 'react';
import { clearProvisionFlashCookie, provisionSMPortalAccess } from './actions';
import { KeyRound, RefreshCw, Copy, CheckCircle } from 'lucide-react';

export interface SectorManagerRow {
  epf_number: string;
  full_name: string;
  site: string;
  pending_otp?: string | null;
}

interface GeneratedOTP {
  otp: string;
  epf: string;
  smName: string;
}

function normalizeEpf(epf: string) {
  return epf.toUpperCase().trim();
}

function buildInitialOtps(
  managers: SectorManagerRow[],
  initialOtp: GeneratedOTP | null | undefined,
): Record<string, string> {
  const otps: Record<string, string> = {};
  for (const sm of managers) {
    if (sm.pending_otp) {
      otps[normalizeEpf(sm.epf_number)] = sm.pending_otp;
    }
  }
  if (initialOtp) {
    otps[normalizeEpf(initialOtp.epf)] = initialOtp.otp;
  }
  return otps;
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
  const [otpsByEpf, setOtpsByEpf] = useState<Record<string, string>>(() =>
    buildInitialOtps(managers, initialOtp),
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedEpf, setCopiedEpf] = useState<string | null>(null);

  useEffect(() => {
    if (initialOtp) {
      void clearProvisionFlashCookie();
    }
  }, [initialOtp]);

  const handleGenerateOTP = (epf: string) => {
    const normalizedEpf = normalizeEpf(epf);
    setErrorMsg('');
    setGeneratingEpf(normalizedEpf);
    startTransition(async () => {
      const result = await provisionSMPortalAccess(epf);
      setGeneratingEpf(null);
      if (result.error) {
        setErrorMsg(result.error);
      } else if (result.success && result.otp) {
        setOtpsByEpf((prev) => ({
          ...prev,
          [normalizeEpf(result.epf ?? epf)]: result.otp!,
        }));
      }
    });
  };

  const copyOTP = (epf: string) => {
    const otp = otpsByEpf[normalizeEpf(epf)];
    if (!otp) return;
    navigator.clipboard.writeText(otp);
    setCopiedEpf(normalizeEpf(epf));
    setTimeout(() => setCopiedEpf(null), 2000);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-slate-600 leading-relaxed">
        Generate a one-time password for a sector manager and share it with them. They use it on first
        SM portal login to set their 6-digit PIN, or again if they forgot their PIN and need a reset. The
        code appears in that manager&apos;s row and stays until they set their PIN or you generate a
        new one.
      </p>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {errorMsg}
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
              const epf = normalizeEpf(sm.epf_number);
              const rowOtp = otpsByEpf[epf];
              const isGenerating = isPending && generatingEpf === epf;
              const isCopied = copiedEpf === epf;
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
                  {rowOtp ? (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <span className="font-mono text-xl font-black tracking-[0.2em] text-amber-700">
                        {rowOtp}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyOTP(epf)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900 transition-all active:scale-95"
                      >
                        {isCopied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {isCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleGenerateOTP(sm.epf_number)}
                    disabled={isGenerating}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    {isGenerating ? 'Generating…' : rowOtp ? 'Regenerate OTP' : 'Generate OTP'}
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
