import Link from 'next/link';

import ShalomPublicWordmark from './ShalomPublicWordmark';
import type { ShalomPublicNavItem } from '../../lib/shalom-public-path';
import ShalomPublicMobileNav from './ShalomPublicMobileNav';

type ShalomPublicHeaderProps = {
  navItems: ShalomPublicNavItem[];
  offsetForEditBar?: boolean;
};

export default function ShalomPublicHeader({ navItems, offsetForEditBar = false }: ShalomPublicHeaderProps) {
  return (
    <header
      className={`sticky z-40 border-b border-[color:var(--shalom-border)] bg-[color:var(--shalom-surface)]/95 backdrop-blur-md ${
        offsetForEditBar ? 'top-[49px]' : 'top-0'
      }`}
    >
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <ShalomPublicWordmark />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--shalom-text)] transition hover:bg-[color:var(--shalom-accent-soft)] hover:text-[color:var(--shalom-accent-hover)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <ShalomPublicMobileNav navItems={navItems} />
      </div>
    </header>
  );
}
