import Link from 'next/link';

import { ECOMMERCE_POLICY_PATHS } from './policy-paths';

const LINKS = [
  { href: ECOMMERCE_POLICY_PATHS.refund, label: 'Refund Policy' },
  { href: ECOMMERCE_POLICY_PATHS.privacy, label: 'Privacy' },
  { href: ECOMMERCE_POLICY_PATHS.terms, label: 'Terms' },
] as const;

export function PolicyFooterLinks({
  className = '',
  linkClassName = 'text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline',
}: {
  className?: string;
  linkClassName?: string;
}) {
  return (
    <footer className={className}>
      <nav aria-label="Legal policies" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {LINKS.map((link, index) => (
          <span key={link.href} className="flex items-center gap-3">
            {index > 0 ? <span className="text-stone-300" aria-hidden>·</span> : null}
            <Link href={link.href} className={`text-[11px] font-medium ${linkClassName}`}>
              {link.label}
            </Link>
          </span>
        ))}
      </nav>
    </footer>
  );
}
