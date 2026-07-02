import Link from 'next/link';

import { ECOMMERCE_POLICY_PATHS } from './policy-paths';
import { buildPolicySections, policyTitle } from './content';
import type { EcommercePolicySite, PolicyKind } from './types';

const POLICY_NAV: Array<{ kind: PolicyKind; label: string }> = [
  { kind: 'refund', label: 'Refund Policy' },
  { kind: 'privacy', label: 'Privacy Policy' },
  { kind: 'terms', label: 'Terms & Conditions' },
];

export function PolicyDocument({
  site,
  kind,
  homeHref = '/',
  embedded = false,
  accentClass = 'text-emerald-800',
  accentBorderClass = 'border-emerald-200',
  accentBgClass = 'bg-emerald-50',
}: {
  site: EcommercePolicySite;
  kind: PolicyKind;
  homeHref?: string;
  /** When true, omit full-page chrome — for use inside ShalomPublicShell. */
  embedded?: boolean;
  accentClass?: string;
  accentBorderClass?: string;
  accentBgClass?: string;
}) {
  const sections = buildPolicySections(site, kind);
  const title = policyTitle(kind);
  const lastUpdated = '26 June 2026';

  const embeddedAccentClass = 'text-[color:var(--shalom-accent)]';
  const embeddedBorderClass = 'border-[color:var(--shalom-border)]';
  const embeddedBgClass = 'bg-[color:var(--shalom-accent-soft)]';
  const resolvedAccentClass = embedded ? embeddedAccentClass : accentClass;
  const resolvedBorderClass = embedded ? embeddedBorderClass : accentBorderClass;
  const resolvedBgClass = embedded ? embeddedBgClass : accentBgClass;
  const mutedTextClass = embedded ? 'text-[color:var(--shalom-muted)]' : 'text-stone-500';
  const bodyTextClass = embedded ? 'text-[color:var(--shalom-text)]/80' : 'text-stone-700';
  const headingClass = embedded ? 'text-[color:var(--shalom-text)]' : 'text-stone-900';

  const policyNav = (
    <nav
      className={`mb-8 flex flex-wrap gap-2 rounded-xl border ${resolvedBorderClass} ${resolvedBgClass} p-3`}
      aria-label="Policy documents"
    >
      {POLICY_NAV.map((item) => {
        const href = ECOMMERCE_POLICY_PATHS[item.kind];
        const active = item.kind === kind;
        return (
          <Link
            key={item.kind}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              active
                ? `bg-white shadow-sm ${resolvedAccentClass}`
                : embedded
                  ? 'text-[color:var(--shalom-muted)] hover:bg-white/70 hover:text-[color:var(--shalom-text)]'
                  : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const policyArticle = (
    <>
      <p className={`mb-6 text-sm ${mutedTextClass}`}>Last updated: {lastUpdated}</p>
      {policyNav}
      <article className="space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className={`text-lg font-black ${headingClass}`}>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className={`mt-3 text-sm leading-relaxed ${bodyTextClass}`}>
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className={`mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed ${bodyTextClass}`}>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>
      <p className={`mt-10 border-t pt-6 text-xs ${mutedTextClass} ${embedded ? 'border-[color:var(--shalom-border)]' : 'border-stone-200'}`}>
        Questions? Email{' '}
        <a href={`mailto:${site.contactEmail}`} className={`font-semibold ${resolvedAccentClass}`}>
          {site.contactEmail}
        </a>
        .
      </p>
    </>
  );

  if (embedded) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
        <h1 className={`mb-2 text-2xl font-semibold ${headingClass}`}>{title}</h1>
        {policyArticle}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className={`border-b ${accentBorderClass} bg-white`}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${accentClass}`}>
              {site.businessName}
            </p>
            <h1 className="text-xl font-black tracking-tight text-stone-900">{title}</h1>
          </div>
          <Link
            href={homeHref}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:bg-stone-50 ${accentBorderClass} ${accentClass}`}
          >
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">{policyArticle}</main>
    </div>
  );
}
