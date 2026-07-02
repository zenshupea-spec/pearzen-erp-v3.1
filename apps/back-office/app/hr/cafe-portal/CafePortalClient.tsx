'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { KeyRound, RefreshCw, Copy, CheckCircle } from 'lucide-react';

import PortalOtpCountdown from '../../executive/settings/PortalOtpCountdown';
import { CAFE_PORTAL_OTP_LIFETIME_MS } from '../../../lib/cafe-front-auth-shared';
import { clearProvisionFlashCookie, provisionCafePortalAccess } from './actions';

export interface CafeStaffRow {
  epf_number: string;
  full_name: string;
  site: string;
}

interface GeneratedOTP {
  otp: string;
  epf: string;
  staffName: string;
  expiresAt: number;
}

function buildInitialOtp(initialOtp: GeneratedOTP | null | undefined): GeneratedOTP | null {
  if (!initialOtp?.otp) return null;
  const expiresAt =
    initialOtp.expiresAt > Date.now()
      ? initialOtp.expiresAt
      : Date.now() + CAFE_PORTAL_OTP_LIFETIME_MS;
  if (expiresAt <= Date.now()) return null;
  return { ...initialOtp, expiresAt };
}

export default function CafePortalClient({
  staff,
  initialOtp = null,
}: {
  staff: CafeStaffRow[];
  initialOtp?: Omit<GeneratedOTP, 'expiresAt'> & { otpExpiresAt?: string } | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [generatingEpf, setGeneratingEpf] = useState<string | null>(null);
  const [generatedOTP, setGeneratedOTP] = useState<GeneratedOTP | null>(() =>
    buildInitialOtp(
      initialOtp
        ? {
            otp: initialOtp.otp,
            epf: initialOtp.epf,
            staffName: initialOtp.staffName,
            expiresAt: initialOtp.otpExpiresAt
              ? Date.parse(initialOtp.otpExpiresAt)
              : Date.now() + CAFE_PORTAL_OTP_LIFETIME_MS,
          }
        : null,
    ),
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const clearGeneratedOtp = useCallback(() => {
    setGeneratedOTP(null);
  }, []);

  useEffect(() => {
    if (initialOtp) {
      void clearProvisionFlashCookie();
    }
  }, [initialOtp]);

  const handleGenerateOTP = (epf: string) => {
    setErrorMsg('');
    setGeneratingEpf(epf);
    startTransition(async () => {
      const result = await provisionCafePortalAccess(epf);
      setGeneratingEpf(null);
      if (result.error) {
        setErrorMsg(result.error);
      } else if (result.success && result.otp) {
        const expiresAt = result.otpExpiresAt
          ? Date.parse(result.otpExpiresAt)
          : Date.now() + CAFE_PORTAL_OTP_LIFETIME_MS;
        setGeneratedOTP({
          otp: result.otp,
          epf: result.epf!,
          staffName: result.staffName!,
          expiresAt,
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
      <p className="text-sm font-semibold leading-relaxed text-slate-600">
        Generate a one-time password for café front office staff and share it with them. They use it
        on first login to set their 6-digit PIN, or again if they forgot their PIN and need a reset.
        Each code expires after five minutes and can only be used once.
      </p>

      {errorMsg ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {errorMsg}
        </div>
      ) : null}

      {generatedOTP ? (
        <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-center gap-2 text-orange-900">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-bold">
              OTP for {generatedOTP.staffName} ({generatedOTP.epf})
            </span>
          </div>
          <div className="rounded-xl border border-orange-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex-1 font-mono text-3xl font-black tracking-[0.25em] text-orange-700">
                {generatedOTP.otp}
              </span>
              <button
                type="button"
                onClick={copyOTP}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-100 px-3 py-2 text-xs font-bold text-orange-900 transition-all active:scale-95"
              >
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <PortalOtpCountdown
              expiresAt={generatedOTP.expiresAt}
              lifetimeMs={CAFE_PORTAL_OTP_LIFETIME_MS}
              onExpired={clearGeneratedOtp}
            />
          </div>
          <p className="text-xs font-semibold text-orange-800">
            Share this code with {generatedOTP.staffName} only. It is shown once and is not stored
            for HR to view again.
            {initialOtp ? ' Auto-provisioned from onboarding.' : ''}
          </p>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <KeyRound className="h-5 w-5 text-orange-600" />
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">
            Café staff ({staff.length})
          </h2>
        </div>

        {staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
            <KeyRound className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold">No active café staff found</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {staff.map((member) => {
              const isGenerating = isPending && generatingEpf === member.epf_number;
              return (
                <li
                  key={member.epf_number}
                  className="flex flex-wrap items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{member.full_name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{member.epf_number}</p>
                    {member.site !== '—' ? (
                      <p className="mt-0.5 text-xs font-semibold uppercase text-slate-400">
                        {member.site}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateOTP(member.epf_number)}
                    disabled={isPending}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
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
