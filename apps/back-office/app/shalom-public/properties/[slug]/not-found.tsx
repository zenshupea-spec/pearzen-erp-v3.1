import Link from 'next/link';

import {
  shalomPublicButtonGhostClass,
  shalomPublicButtonPrimaryClass,
  shalomPublicDisplayClass,
  shalomPublicSurfaceClass,
} from '../../../../lib/shalom-public-tokens';
import { shalomPublicHref } from '../../../../lib/shalom-public-path';

export const metadata = {
  title: 'Property not found — Shalom Residence',
  description: 'This property is not available on Shalom Residence.',
};

export default function ShalomPropertyNotFound() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center px-5 py-20 text-center lg:px-8 lg:py-28">
      <div className={`w-full px-6 py-10 ${shalomPublicSurfaceClass}`}>
        <p
          className={`text-xs font-bold uppercase tracking-[0.28em] text-[color:var(--shalom-accent)] ${shalomPublicDisplayClass}`}
        >
          Shalom Residence
        </p>
        <h1
          className={`mt-3 text-3xl font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
        >
          Property not found
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[color:var(--shalom-muted)]">
          This stay may have been unpublished or the link may be incorrect. Browse our available
          properties or return home to start again.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={shalomPublicHref('/properties')} className={shalomPublicButtonPrimaryClass}>
            View properties
          </Link>
          <Link href={shalomPublicHref('/')} className={shalomPublicButtonGhostClass}>
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
