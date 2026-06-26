'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Flame, Radio, Shield } from 'lucide-react';

import BrandWatermarkBackground from '../../components/portal/BrandWatermarkBackground';
import GoogleSignInButton from '../GoogleSignInButton';
import HeadOfficeLoginForm from './HeadOfficeLoginForm';

const HEAD_OFFICE_ROLES = ['MD', 'OD', 'HQ', 'OM', 'TM'];

type Variant = 'head-office' | 'forge' | 'partners' | 'pears' | 'om' | 'tm' | 'md' | 'hq';

function staffPortalForVariant(variant: Variant): StaffPortalId | undefined {
  if (variant === 'md' || variant === 'om' || variant === 'tm' || variant === 'hq') {
    return variant;
  }
  return undefined;
}

const VARIANT_COPY: Record<
  Variant,
  {
    title: string;
    subtitle: string;
    roles: string[];
    signInHint: string;
    beam: 'rose' | 'indigo' | 'sky' | 'violet' | 'emerald';
  }
> = {
  'head-office': {
    title: 'Pearzen ERP',
    subtitle: 'Staff portal gateway',
    roles: [],
    signInHint: 'Use /login to choose your portal',
    beam: 'rose',
  },
  md: {
    title: 'MD Portal',
    subtitle: 'Managing Director & Operations Director',
    roles: ['MD', 'OD'],
    signInHint: '',
    beam: 'indigo',
  },
  hq: {
    title: 'HQ Staff Portal',
    subtitle: 'HR · finance desk · deductions · hub modules',
    roles: ['HR', 'FM', 'EA'],
    signInHint: 'Work email + OTP or PIN — HQ staff and RBAC roles only',
    beam: 'emerald',
  },
  forge: {
    title: 'SaaS Forge',
    subtitle: 'Platform Operator Console',
    roles: [],
    signInHint: 'Step 1: Google identity · Step 2: operator password — both required',
    beam: 'indigo',
  },
  partners: {
    title: 'Pearzen Partners',
    subtitle: 'Independent Service Partner Workspace',
    roles: [],
    signInHint: 'Google sign-in for provisioned ISP managers',
    beam: 'sky',
  },
  pears: {
    title: 'PEARS Shop Profile',
    subtitle: 'Website client self-service',
    roles: [],
    signInHint: 'Google sign-in with your website purchase email or tenant MD account',
    beam: 'violet',
  },
  om: {
    title: 'OM Command Center',
    subtitle: 'Field Operations & Tactical Deployment',
    roles: ['OM'],
    signInHint: 'Work email + OTP or PIN from OD/MD',
    beam: 'sky',
  },
  tm: {
    title: 'TM Command Center',
    subtitle: 'Territory Oversight & Shift Verification',
    roles: ['TM'],
    signInHint: 'Work email + OTP or PIN from OD/MD',
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
  forgeEmailForm?: React.ReactNode;
  forgeDevBypass?: boolean;
  forgeGoogleVerified?: boolean;
  forgeOperatorEmail?: string | null;
};

const BRAND_EMBLEM_SIZE = 'clamp(3.5rem, 22vw, 5rem)';

function BrandCompanyName({
  name,
  className,
  emblemRef,
}: {
  name: string;
  className?: string;
  emblemRef: RefObject<HTMLDivElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      const emblemPx = emblemRef.current?.offsetWidth ?? 80;
      const maxSize = emblemPx * 0.3;
      const minSize = emblemPx * 0.175;
      let size = maxSize;

      text.style.fontSize = `${size}px`;
      const limit = container.clientWidth;

      while (size > minSize && text.scrollWidth > limit) {
        size -= 0.5;
        text.style.fontSize = `${size}px`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    if (emblemRef.current) observer.observe(emblemRef.current);

    return () => observer.disconnect();
  }, [name, emblemRef]);

  return (
    <div ref={containerRef} className="w-full">
      <p ref={textRef} className={`whitespace-nowrap text-center ${className ?? ''}`}>
        {name}
      </p>
    </div>
  );
}

export default function LoginShell({
  logoUrl,
  companyName,
  authError,
  authErrorDetail,
  variant = 'head-office',
  oauthNext = '/',
  signInDisabled = false,
  forgeEmailForm,
  forgeDevBypass = false,
  forgeGoogleVerified = false,
  forgeOperatorEmail = null,
}: Props) {
  const [armed, setArmed] = useState(false);
  const emblemRef = useRef<HTMLDivElement>(null);
  const copy = VARIANT_COPY[variant];
  const isForge = variant === 'forge';
  const isPartners = variant === 'partners';
  const isFieldPortal = variant === 'om' || variant === 'tm';
  const isMdPortal = variant === 'md';
  const isHqPortal = variant === 'hq';
  const staffPortal = staffPortalForVariant(variant);
  const displayCompanyName = companyName?.trim() || 'Classic Venture Security';

  const beamStyle = armed
    ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(34,197,94,0.16), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(16,185,129,0.1), transparent 55%)'
    : variant === 'om'
      ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(14,165,233,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(56,189,248,0.09), transparent 55%)'
      : variant === 'tm'
        ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(139,92,246,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(167,139,250,0.09), transparent 55%)'
        : variant === 'md'
          ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(99,102,241,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(129,140,248,0.09), transparent 55%)'
          : variant === 'hq'
            ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(16,185,129,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(52,211,153,0.09), transparent 55%)'
            : isForge
          ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(99,102,241,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(129,140,248,0.09), transparent 55%)'
          : isPartners
            ? 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(6,182,212,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(34,211,238,0.09), transparent 55%)'
          : 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(239,68,68,0.14), transparent 65%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(248,113,113,0.09), transparent 55%)';

  const idleAccent =
    variant === 'om'
      ? 'sky'
      : variant === 'tm'
        ? 'violet'
        : variant === 'md'
          ? 'indigo'
          : variant === 'hq'
            ? 'emerald'
            : isForge
              ? 'indigo'
              : isPartners
                ? 'sky'
              : 'rose';

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] animate-connection-beam transition-all duration-700"
        style={{ background: beamStyle }}
      />

      <main className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="relative">
                <div
                  ref={emblemRef}
                  style={{ width: BRAND_EMBLEM_SIZE, height: BRAND_EMBLEM_SIZE }}
                  className={`flex items-center justify-center overflow-hidden rounded-2xl ${
                    isForge
                      ? 'border border-indigo-200 bg-indigo-950 shadow-lg shadow-indigo-900/30'
                      : logoUrl
                        ? 'border border-slate-200 bg-white shadow-lg shadow-slate-900/10'
                        : 'border border-slate-700/20 bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg shadow-slate-900/30'
                  }`}
                >
                  {isForge ? (
                    <Flame className="h-[50%] w-[50%] text-indigo-300" strokeWidth={1.75} />
                  ) : logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logoUrl}
                      alt=""
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <Shield className="h-[50%] w-[50%] text-slate-100" strokeWidth={1.75} />
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
                <BrandCompanyName
                  name={displayCompanyName}
                  emblemRef={emblemRef}
                  className={`font-university-roman uppercase tracking-[0.12em] transition-colors duration-500 ${
                    armed
                      ? 'text-emerald-800'
                      : isFieldPortal
                        ? idleAccent === 'sky'
                          ? 'text-sky-900'
                          : 'text-violet-900'
                        : isMdPortal
                          ? 'text-indigo-900'
                          : isHqPortal
                            ? 'text-emerald-900'
                            : 'text-rose-900'
                  }`}
                />
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
            {variant === 'forge' ? (
              <>
                {authError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                    {authError}
                    {authErrorDetail ? (
                      <span className="mt-1 block font-medium">{authErrorDetail}</span>
                    ) : null}
                  </div>
                ) : null}
                {forgeDevBypass ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-medium text-amber-900">
                    Local dev — sign in with operator email and password. Google OAuth is
                    skipped so you stay on localhost.
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      1 · Google identity
                    </p>
                    <GoogleSignInButton
                      armed={armed || forgeGoogleVerified}
                      onArm={() => setArmed(true)}
                      redirectNext={oauthNext}
                      disabled={signInDisabled || forgeGoogleVerified}
                      completed={forgeGoogleVerified}
                      completedLabel={
                        forgeOperatorEmail
                          ? `Verified · ${forgeOperatorEmail}`
                          : 'Google verified'
                      }
                    />
                  </>
                )}
                {forgeEmailForm ? (
                  <>
                    <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {forgeDevBypass ? 'Operator credentials' : '2 · Operator credentials'}
                    </p>
                    {forgeEmailForm}
                  </>
                ) : (
                  <p className="text-center text-xs text-slate-500">{copy.signInHint}</p>
                )}
              </>
            ) : variant === 'partners' ? (
              <>
                {authError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                    {authError}
                  </div>
                ) : null}
                <GoogleSignInButton
                  armed={armed}
                  onArm={() => setArmed(true)}
                  redirectNext={oauthNext}
                  disabled={signInDisabled}
                />
                <p className="text-center text-xs text-slate-500">{copy.signInHint}</p>
              </>
            ) : (
              <HeadOfficeLoginForm
                authError={authError}
                authErrorDetail={authErrorDetail}
                nextPath={oauthNext}
                staffPortal={staffPortal}
                signInHint={copy.signInHint}
              />
            )}
          </div>

          <p className="text-center text-[10px] font-mono text-slate-400">
            Restricted access · Activity is audited
          </p>
        </div>
      </main>
    </div>
  );
}
