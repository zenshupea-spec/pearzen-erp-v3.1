'use client';

import Image from 'next/image';

import { resolveShalomPublicMediaPublicUrl } from '../../../../packages/supabase/shalom-public-media-storage';
import { shalomPublicDisplayClass } from '../../lib/shalom-public-tokens';
import { useShalomPublicWebsite } from './ShalomPublicWebsiteContext';
import {
  ShalomEditableField,
  useShalomPublicWebsiteEdit,
} from './ShalomPublicWebsiteEditProvider';

export default function ShalomPublicHomeHero() {
  const { canEdit } = useShalomPublicWebsite();
  const { editing, content, patch } = useShalomPublicWebsiteEdit();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const heroImageUrl =
    resolveShalomPublicMediaPublicUrl(supabaseUrl, content.heroImageUrl) ??
    ('heroImagePublicUrl' in content ? content.heroImagePublicUrl : null) ??
    null;

  return (
    <section className="relative overflow-hidden border-b border-[color:var(--shalom-border)] bg-[color:var(--shalom-surface)]">
      {heroImageUrl ? (
        <>
          <Image
            src={heroImageUrl}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-[color:var(--shalom-surface)]/78" aria-hidden />
        </>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -10%, var(--shalom-accent-soft), transparent 70%)',
          }}
        />
      )}
      <div className="relative mx-auto max-w-6xl px-5 py-16 text-center lg:px-8 lg:py-20">
        {canEdit && editing ? (
          <ShalomEditableField
            label="Hero eyebrow"
            value={content.heroEyebrow}
            editing={editing}
            onChange={(heroEyebrow) => patch({ heroEyebrow })}
            className={`mx-auto max-w-md text-xs font-bold uppercase tracking-[0.35em] text-[color:var(--shalom-accent)] ${shalomPublicDisplayClass}`}
          />
        ) : (
          <p
            className={`whitespace-nowrap text-xs font-bold uppercase tracking-[0.35em] text-[color:var(--shalom-accent)] ${shalomPublicDisplayClass}`}
          >
            {content.heroEyebrow}
          </p>
        )}

        {canEdit && editing ? (
          <div
            className={`mx-auto mt-4 max-w-2xl space-y-3 text-4xl font-semibold leading-tight text-[color:var(--shalom-text)] sm:text-5xl lg:text-6xl ${shalomPublicDisplayClass}`}
          >
            <ShalomEditableField
              label="Hero title prefix"
              value={content.heroTitlePrefix}
              editing={editing}
              onChange={(heroTitlePrefix) => patch({ heroTitlePrefix })}
            />
            <ShalomEditableField
              label="Hero title brand"
              value={content.heroTitleBrand}
              editing={editing}
              onChange={(heroTitleBrand) => patch({ heroTitleBrand })}
            />
          </div>
        ) : (
          <h1
            className={`mx-auto mt-4 max-w-2xl text-4xl font-semibold leading-tight text-[color:var(--shalom-text)] sm:text-5xl lg:text-6xl ${shalomPublicDisplayClass}`}
          >
            {content.heroTitlePrefix}{' '}
            <span className="whitespace-nowrap">{content.heroTitleBrand}</span>
          </h1>
        )}

        {canEdit && editing ? (
          <ShalomEditableField
            label="Hero description"
            value={content.heroDescription}
            editing={editing}
            onChange={(heroDescription) => patch({ heroDescription })}
            multiline
            className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[color:var(--shalom-muted)] sm:text-base"
          />
        ) : (
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[color:var(--shalom-muted)] sm:text-base">
            {content.heroDescription}
          </p>
        )}
      </div>
    </section>
  );
}
