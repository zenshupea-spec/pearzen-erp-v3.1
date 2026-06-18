'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  MapPinned,
  Mic,
  Phone,
  ShieldCheck,
  Users,
} from 'lucide-react';

import SecurityPortalCarousel from './SecurityPortalCarousel';
import { useSecurityWebsiteEdit } from './SecurityWebsiteEditProvider';
import { useSecurityWebsite } from './SecurityWebsiteContext';

const FEATURE_ICONS = [MapPinned, ShieldCheck, Mic, LayoutDashboard];

function Field({
  label,
  value,
  editing,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  if (!editing) return <>{value}</>;
  const shared =
    'w-full rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-2 text-slate-900 shadow-sm outline-none ring-amber-400/40 focus:ring-2 placeholder:text-slate-500';
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={`${shared} resize-y min-h-[72px]`}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={shared} />
      )}
    </label>
  );
}

export default function SecurityPlatformShowcase() {
  const { ui } = useSecurityWebsite();
  const { editing, draft, content, patch, patchTech } = useSecurityWebsiteEdit();
  const features = editing ? draft.techFeatures : content.techFeatures;

  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-red-700">
              Manpower + technology
            </p>
            {editing ? (
              <div className="mt-3 space-y-3">
                <Field
                  label="Technology title"
                  value={draft.techTitle}
                  editing
                  onChange={(techTitle) => patch({ techTitle })}
                />
                <Field
                  label="Technology subtitle"
                  value={draft.techSubtitle}
                  editing
                  onChange={(techSubtitle) => patch({ techSubtitle })}
                  multiline
                />
              </div>
            ) : (
              <>
                <h2 className="mt-2 text-3xl font-semibold uppercase tracking-tight text-slate-900 md:text-4xl max-md:text-2xl">
                  {content.techTitle}
                </h2>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">
                  {content.techSubtitle}
                </p>
              </>
            )}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {features.map((feature, index) => {
                const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length];
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    {editing ? (
                      <div className="space-y-2">
                        <Field
                          label={`Capability ${index + 1} title`}
                          value={draft.techFeatures[index]?.title ?? ''}
                          editing
                          onChange={(value) => patchTech(index, 'title', value)}
                        />
                        <Field
                          label={`Capability ${index + 1} description`}
                          value={draft.techFeatures[index]?.description ?? ''}
                          editing
                          onChange={(value) => patchTech(index, 'description', value)}
                          multiline
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 sm:block">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
                            <Icon className="h-4 w-4" />
                          </div>
                          <h3 className="min-w-0 text-sm font-bold uppercase tracking-wide text-slate-900 sm:mt-3">
                            {feature.title}
                          </h3>
                        </div>
                        <p className="mt-1 text-sm leading-snug text-slate-600">
                          {feature.description}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:pt-8">
            <SecurityPortalCarousel />
            <div className="mx-auto mt-10 flex w-full max-w-[480px] flex-wrap justify-center gap-3 px-2">
              <Link
                href="/clientlogin"
                className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-800"
              >
                <LayoutDashboard className="h-4 w-4" />
                {ui.navClientPortal}
              </Link>
              <Link
                href="/security-website/pricing"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-red-200 hover:text-red-800"
              >
                {ui.requestAssessment}
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Users,
              label: '170+ clients nationwide',
              detail: 'Island-wide coverage across Sri Lanka',
            },
            {
              icon: Phone,
              label: '24/7 emergency response',
              detail: 'Duty manager hotline + visiting officer dispatch',
            },
            {
              icon: ShieldCheck,
              label: 'Audit-ready proof',
              detail: 'GPS logs, SM visits, and incident trails',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-red-100 bg-red-50/40 px-4 py-3 sm:flex sm:items-center sm:gap-3"
            >
              <item.icon className="h-4 w-4 shrink-0 text-red-700" />
              <div className="mt-2 sm:mt-0">
                <p className="text-sm font-bold text-slate-900">{item.label}</p>
                <p className="text-xs leading-snug text-slate-600">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
