import Link from 'next/link';
import { Building2, Gem, Map, Radio } from 'lucide-react';

import BrandWatermarkBackground from '../../components/portal/BrandWatermarkBackground';
import { getCompanyLogoUrl } from '../../../../packages/supabase/company-branding';
import { PORTAL_GATEWAY_CARDS } from '../../lib/portal-isolation';
import { resolveTenantCompanyFromRequest } from '../../lib/tenant-context-server';

const CARD_ICONS = {
  md: Gem,
  om: Map,
  tm: Radio,
  hq: Building2,
} as const;

export default async function PortalGatewayPage() {
  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);
  const companyName = tenant?.name?.trim() || 'Classic Venture Security';

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 text-center">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              className="mx-auto mb-4 h-14 w-auto max-w-[10rem] object-contain"
            />
          ) : null}
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
            {companyName}
          </p>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-slate-900 sm:text-3xl">
            Staff Portals
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Choose your isolated portal — each has a separate sign-in for security.
          </p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2">
          {PORTAL_GATEWAY_CARDS.map((card) => {
            const Icon = CARD_ICONS[card.id];
            return (
              <Link
                key={card.id}
                href={card.href}
                className="group rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 group-hover:bg-white">
                    <Icon className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">
                      {card.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{card.subtitle}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[10px] font-mono text-slate-400">
          Restricted access · Activity is audited
        </p>
      </main>
    </div>
  );
}
