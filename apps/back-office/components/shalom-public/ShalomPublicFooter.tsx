'use client';

import Link from 'next/link';

import { shalomPublicDisplayClass } from '../../lib/shalom-public-tokens';
import { shalomPublicHref } from '../../lib/shalom-public-path';
import {
  formatShalomPublicContactPhoneDisplay,
  shalomPublicContactTelHref,
} from '../../lib/shalom-public-contact';
import { useShalomPublicWebsite } from './ShalomPublicWebsiteContext';
import {
  ShalomEditableField,
  useShalomPublicWebsiteEdit,
} from './ShalomPublicWebsiteEditProvider';

export default function ShalomPublicFooter() {
  const { canEdit } = useShalomPublicWebsite();
  const { editing, content, patch } = useShalomPublicWebsiteEdit();
  const contactPhoneDisplay = formatShalomPublicContactPhoneDisplay(content.contactPhone);

  return (
    <footer className="mt-auto border-t border-[color:var(--shalom-border)] bg-[color:var(--shalom-surface)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1.2fr_1fr] lg:px-8">
        <div>
          <p
            className={`text-lg font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
          >
            {content.brandName}
          </p>
          {canEdit && editing ? (
            <ShalomEditableField
              label="Footer blurb"
              value={content.footerBlurb}
              editing={editing}
              onChange={(footerBlurb) => patch({ footerBlurb })}
              multiline
              className="mt-2 max-w-sm text-sm leading-relaxed text-[color:var(--shalom-muted)]"
            />
          ) : (
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[color:var(--shalom-muted)]">
              {content.footerBlurb}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--shalom-muted)]">
            Explore
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                href={shalomPublicHref('/properties')}
                className="font-medium text-[color:var(--shalom-text)] hover:text-[color:var(--shalom-accent)]"
              >
                All properties
              </Link>
            </li>
            <li>
              <a
                href={`mailto:${content.contactEmail}`}
                className="font-medium text-[color:var(--shalom-text)] hover:text-[color:var(--shalom-accent)]"
              >
                {content.contactEmail}
              </a>
            </li>
            <li>
              <a
                href={shalomPublicContactTelHref(content.contactPhone)}
                className="font-medium text-[color:var(--shalom-text)] hover:text-[color:var(--shalom-accent)]"
              >
                {contactPhoneDisplay}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[color:var(--shalom-border)] px-5 py-4 text-center text-xs leading-relaxed text-[color:var(--shalom-muted)] lg:px-8">
        <p>
          © {new Date().getFullYear()} {content.brandName}. All rights reserved.
        </p>
        <p className="mt-1">
          <a
            href={`mailto:${content.contactEmail}`}
            className="font-semibold text-[color:var(--shalom-accent)] hover:text-[color:var(--shalom-accent-hover)]"
          >
            {content.contactEmail}
          </a>
        </p>
      </div>
    </footer>
  );
}
