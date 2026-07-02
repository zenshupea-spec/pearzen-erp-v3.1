'use client';

import { useEffect } from 'react';

/** Keep the browser tab icon in sync when the sidebar logo loads or changes. */
export default function TenantFavicon({ logoUrl }: { logoUrl?: string | null }) {
  useEffect(() => {
    const href = logoUrl?.trim();
    if (!href) return;

    const type = href.toLowerCase().includes('.svg') ? 'image/svg+xml' : undefined;
    const rels = ['icon', 'shortcut icon', 'apple-touch-icon'];

    for (const rel of rels) {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
      if (type) link.type = type;
      else link.removeAttribute('type');
    }
  }, [logoUrl]);

  return null;
}
