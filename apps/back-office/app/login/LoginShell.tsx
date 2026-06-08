'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Flame, Radio, Shield } from 'lucide-react';

import BrandWatermarkBackground from '../../components/portal/BrandWatermarkBackground';
import GoogleSignInButton from '../GoogleSignInButton';

const HEAD_OFFICE_ROLES = ['MD', 'OD', 'HR', 'FM', 'SEC', 'AD', 'EA'];

type Variant = 'head-office' | 'forge' | 'om' | 'tm';

const VARIANT_COPY: Record<
  Variant,
  {
    title: string;
    subtitle: string;
    roles: string[];
    signInHint: string;
    beam: 'rose' | 'indigo' | 'sky' | 'violet';
  }
> = {
  'head-office': {
    title: 'Pearzen ERP',
    subtitle: 'Head Office Command Center',
    roles: HEAD_OFFICE_ROLES,
    signInHint: 'Sign in with your authorised Google workspace account',
    beam: 'rose',
  },
  forge: {
    title: 'SaaS Forge',
    subtitle: 'Platform Operator Console',
    roles: [],
    signInHint: 'Sign in with your platform operator Google account',
    beam: 'indigo',
  },
  om: {
    title: 'OM Command Center',
    subtitle: 'Field Operations & Tactical Deployment',
    roles: ['OM'],
    signInHint: 'Sign in with your Operations Manager Google workspace account',
    beam: 'sky',
  },
  tm: {
    title: 'TM Command Center',
    subtitle: 'Territory Oversight & Shift Verification',
    roles: ['TM'],
    signInHint: 'Sign in with your Territory Manager Google workspace account',
    beam: 'violet',
  },
};

type Props = {
  logoUrl: string | null;
  companyName?: string | null;
  authError?: string | null;
  authErrorDetail?: string | null;
  variant?: Variant;
  oauthNext?: string;
  signInDisabled?: boolean;
};

export default function LoginShell({
  logoUrl,
  companyName,
  authError,
  authErrorDetail,
  variant = 'head-office',
  oauthNext = '/',
  signInDisabled = false,
}: Props) {
  const [armed, setArmed] = useState(false);
  const copy = VARIANT_COPY[variant];
  const isForge = variant === 'forge';
  const isFieldPortal = variant === 'om' || variant === 'tm';
  const displayCompanyName = companyName?.trim() || 'Classic Venture Security';

  const beamStyle = armed
    ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(34,197,94,0.16), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(16,185,129,0.1), transparent 55%)'
    : variant === 'om'
      ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(14,165,233,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(56,189,248,0.09), transparent 55%)'
      : variant === 'tm'
        ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(139,92,246,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(167,139,250,0.09), transparent 55%)'
        : isForge
          ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(99,102,241,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(129,140,248,0.09), transparent 55%)'
          : 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(239,68,68,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(248,113,113,0.09), transparent 55%)';

  const idleAccent =
    variant === 'om' ? 'sky' : variant === 'tm' ? 'violet' : isForge ? 'indigo' : 'rose';

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] animate-connection-beam transition-all duration-700"
        style={{ background: beamStyle }}
      />

      <main className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="absolute left-4 top-6 sm:left-8">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All portals
          </Link>
        </div>

        <div className="w-full max-w-md space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="relative">
                <div
                  className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl ${
                    isForge
                      ? 'border border-indigo-200 bg-indigo-950 shadow-lg shadow-indigo-900/30'
                      : logoUrl
                        ? 'border border-slate-200 bg-white shadow-lg shadow-slate-900/10'
                        : 'border border-slate-700/20 bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg shadow-slate-900/30'
                  }`}
                >
                  {isForge ? (
                    <Flame className="h-10 w-10 text-indigo-300" strokeWidth={1.75} />
                  ) : logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logoUrl}
                      alt=""
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <Shield className="h-10 w-10 text-slate-100" strokeWidth={1.75} />
                  )}
                </div>
                <span
                  className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-sm transition-colors duration-500 ${
                    armed
                      ? 'bg-emerald-500'
                      : idleAccent === 'sky'
                        ? 'bg-sky-500'
                        : idleAccent === 'violet'
                          ? 'bg-violet-500'
                          : idleAccent === 'indigo'
                            ? 'bg-indigo-500'
                            : 'bg-rose-500'
                  }`}
                >
                  <Radio className="h-3 w-3 text-white" strokeWidth={2.5} />
                </span>
              </div>
            </div>
            <div>
              {!isForge ? (
                <p
                  className={`font-university-roman text-xl uppercase tracking-[0.12em] transition-colors duration-500 sm:text-2xl ${
                    armed
                      ? 'text-emerald-800'
                      : isFieldPortal
                        ? idleAccent === 'sky'
                          ? 'text-sky-900'
                          : 'text-violet-900'
                        : 'text-rose-900'
                  }`}
                >
                  {displayCompanyName}
                </p>
              ) : (
                <p className="text-[10px] font-mono font-bold uppercase tracking-[0.35em] text-indigo-500">
                  Pearzen Platform
                </p>
              )}
              <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">
                {copy.title}
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                {copy.subtitle}
              </p>
            </div>
          </div>

          {copy.roles.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {copy.roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur-sm"
                >
                  {role}
                </span>
              ))}
            </div>
          ) : null}

          <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm backdrop-blur-md">
            {authError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                {authError}
                {authErrorDetail ? (
                  <span className="mt-1 block font-medium">{authErrorDetail}</span>
                ) : null}
              </div>
            ) : null}

            <p className="text-center text-xs text-slate-500">{copy.signInHint}</p>
            <GoogleSignInButton
              armed={armed}
              onArm={() => setArmed(true)}
              redirectNext={oauthNext}
              disabled={signInDisabled}
            />
          </div>

          <p className="text-center text-[10px] font-mono text-slate-400">
            Restricted access · Activity is audited
          </p>
        </div>
      </main>
    </div>
  );
}
