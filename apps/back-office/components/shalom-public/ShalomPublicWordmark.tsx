'use client';

import Image from 'next/image';
import Link from 'next/link';

import { resolveShalomPublicMediaPublicUrl } from '../../../../packages/supabase/shalom-public-media-storage';
import { shalomPublicDisplayClass } from '../../lib/shalom-public-tokens';
import { shalomPublicHref } from '../../lib/shalom-public-path';
import { useShalomPublicWebsite } from './ShalomPublicWebsiteContext';
import {
  ShalomEditableField,
  useShalomPublicWebsiteEdit,
} from './ShalomPublicWebsiteEditProvider';

export default function ShalomPublicWordmark({ compact = false }: { compact?: boolean }) {
  const { canEdit, content: siteContent } = useShalomPublicWebsite();
  const { editing, content, patch } = useShalomPublicWebsiteEdit();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const logoUrl =
    resolveShalomPublicMediaPublicUrl(supabaseUrl, content.logoImageUrl) ??
    ('logoImagePublicUrl' in siteContent ? siteContent.logoImagePublicUrl : null);

  return (
    <Link href={shalomPublicHref('/')} className="group inline-flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--shalom-border)] bg-white shadow-sm">
          <Image
            src={logoUrl}
            alt={content.brandName}
            width={40}
            height={40}
            className="h-full w-full object-contain p-1"
            unoptimized
          />
        </span>
      ) : (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--shalom-border)] bg-[color:var(--shalom-accent-soft)] text-[color:var(--shalom-accent)] shadow-sm transition group-hover:border-[color:var(--shalom-accent)]"
          aria-hidden
        >
          <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M6 24V13.5L16 8l10 5.5V24H6Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M12 24v-6h8v6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      <span className="min-w-0">
        {canEdit && editing ? (
          <ShalomEditableField
            label="Brand name"
            value={content.brandName}
            editing={editing}
            onChange={(brandName) => patch({ brandName })}
            className={`block text-[10px] font-bold uppercase tracking-[0.32em] text-[color:var(--shalom-accent)] ${shalomPublicDisplayClass}`}
          />
        ) : (
          <span
            className={`block whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.32em] text-[color:var(--shalom-accent)] ${shalomPublicDisplayClass}`}
          >
            {content.brandName}
          </span>
        )}
        {!compact ? (
          canEdit && editing ? (
            <ShalomEditableField
              label="Header tagline"
              value={content.wordmarkTagline}
              editing={editing}
              onChange={(wordmarkTagline) => patch({ wordmarkTagline })}
              className="mt-1 block truncate text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--shalom-muted)]"
            />
          ) : (
            <span className="block truncate text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--shalom-muted)] transition group-hover:text-[color:var(--shalom-text)]">
              {content.wordmarkTagline}
            </span>
          )
        ) : null}
      </span>
    </Link>
  );
}
