import Link from 'next/link';

import {
  ECOMMERCE_POLICY_PATHS,
  SHALOM_RESIDENCE_POLICY_SITE,
} from '../../../../packages/ecommerce-policies';

const POLICY_LINKS = [
  { href: ECOMMERCE_POLICY_PATHS.refund, label: 'Refund Policy' },
  { href: ECOMMERCE_POLICY_PATHS.privacy, label: 'Privacy Policy' },
  { href: ECOMMERCE_POLICY_PATHS.terms, label: 'Terms & Conditions' },
] as const;

export const metadata = {
  title: 'Shalom Residence',
  description: 'Shalom Residence — accommodation bookings and guest information',
};

export default function ShalomPublicHomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-teal-400">
          Shalom Residence
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Guest bookings</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          Our public booking site is coming soon. In the meantime, our business policies are
          available below for your reference.
        </p>
        <nav className="mt-10 space-y-3" aria-label="Legal policies">
          {POLICY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:border-teal-400/50 hover:bg-teal-500/10"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="mt-10 text-xs text-slate-500">
          Questions?{' '}
          <a
            href={`mailto:${SHALOM_RESIDENCE_POLICY_SITE.contactEmail}`}
            className="font-semibold text-teal-400 hover:text-teal-300"
          >
            {SHALOM_RESIDENCE_POLICY_SITE.contactEmail}
          </a>
        </p>
      </main>
    </div>
  );
}
