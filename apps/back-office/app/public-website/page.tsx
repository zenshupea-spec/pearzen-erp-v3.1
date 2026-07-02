import Link from 'next/link';

import { formatLkr } from '../../lib/saas-billing';
import { resolveSecurityWebsiteCompanyId } from '../../lib/security-website-data';
import { fetchTenantLandingContentForCompany } from '../../lib/tenant-public-site-data';

export default async function TenantPublicWebsitePage() {
  const companyId = await resolveSecurityWebsiteCompanyId();
  const content = await fetchTenantLandingContentForCompany(companyId);
  const activeProducts = content.products.filter((product) => product.isActive);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400">
              {content.tagline}
            </p>
            <h1 className="text-xl font-black tracking-tight">{content.companyName}</h1>
          </div>
          <Link
            href={content.heroCtaHref}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-cyan-400"
          >
            {content.heroCtaLabel}
          </Link>
        </div>
      </header>

      {content.heroImageUrl ? (
        <div className="border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.heroImageUrl}
            alt=""
            className="mx-auto max-h-80 w-full max-w-5xl object-cover"
          />
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-6 py-16 space-y-16">
        <section className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
            {content.heroHeadline}
          </h2>
          <p className="text-lg text-slate-300 max-w-3xl">{content.heroSubheadline}</p>
        </section>

        {activeProducts.length > 0 ? (
          <section className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-cyan-300">Shop</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {activeProducts.map((product) => (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                >
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-white/5 text-slate-500 text-sm">
                      No image
                    </div>
                  )}
                  <div className="space-y-2 p-5">
                    <h4 className="text-lg font-bold text-white">{product.name}</h4>
                    {product.description ? (
                      <p className="text-sm text-slate-300">{product.description}</p>
                    ) : null}
                    <p className="text-sm font-semibold text-cyan-300">
                      {formatLkr(product.priceLkr)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            {content.aboutTitle}
          </h3>
          <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{content.aboutBody}</p>
        </section>

        <section className="rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-8">
          <h3 className="text-sm font-bold uppercase tracking-widest text-cyan-300">Contact</h3>
          <p className="mt-3 text-slate-200">
            <a href={`mailto:${content.contactEmail}`} className="hover:text-white">
              {content.contactEmail}
            </a>
            {' · '}
            <a href={`tel:${content.contactPhone}`} className="hover:text-white">
              {content.contactPhone}
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
