import type { Metadata } from 'next';

import ShalomPropertyCard from '../../../components/shalom-public/ShalomPropertyCard';
import { fetchPublishedShalomListings } from '../../../lib/shalom-public-data';
import {
  buildShalomPublicPageMetadata,
  SHALOM_PUBLIC_DEFAULT_DESCRIPTION,
} from '../../../lib/shalom-public-seo';
import { shalomPublicDisplayClass, shalomPublicSurfaceClass } from '../../../lib/shalom-public-tokens';

export const metadata: Metadata = buildShalomPublicPageMetadata({
  title: 'All properties',
  description: `Browse every published stay at Shalom Residence. ${SHALOM_PUBLIC_DEFAULT_DESCRIPTION}`,
  path: '/properties',
});

export default async function ShalomPropertiesIndexPage() {
  const listings = await fetchPublishedShalomListings();

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
      <header className="mb-8 max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--shalom-accent)]">
          Shalom Residence
        </p>
        <h1
          className={`mt-3 text-3xl font-semibold text-[color:var(--shalom-text)] sm:text-4xl ${shalomPublicDisplayClass}`}
        >
          All properties
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--shalom-muted)] sm:text-base">
          Every residence currently open for direct booking — compare locations, nightly rates, and
          amenities before you choose dates.
        </p>
      </header>

      {listings.length > 0 ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <li key={listing.id}>
              <ShalomPropertyCard listing={listing} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={`px-6 py-12 text-center ${shalomPublicSurfaceClass}`}>
          <p
            className={`text-xl font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
          >
            Listings coming soon
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[color:var(--shalom-muted)]">
            Published stays will appear here once the MD team enables them on the guest website.
          </p>
        </div>
      )}
    </section>
  );
}
