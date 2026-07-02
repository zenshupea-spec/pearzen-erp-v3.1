'use client';

import ShalomContactForm from './ShalomContactForm';
import {
  formatShalomPublicContactPhoneDisplay,
  shalomPublicContactTelHref,
} from '../../lib/shalom-public-contact';
import {
  shalomPublicDisplayClass,
  shalomPublicSurfaceClass,
} from '../../lib/shalom-public-tokens';
import {
  ShalomEditableField,
  useShalomPublicWebsiteEdit,
} from './ShalomPublicWebsiteEditProvider';
import { useShalomPublicWebsite } from './ShalomPublicWebsiteContext';

export default function ShalomContactPageContent() {
  const { canEdit } = useShalomPublicWebsite();
  const { editing, content, patch } = useShalomPublicWebsiteEdit();
  const contactPhoneDisplay = formatShalomPublicContactPhoneDisplay(content.contactPhone);

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--shalom-accent)]">
          {content.brandName}
        </p>
        <h1
          className={`mt-3 text-3xl font-semibold text-[color:var(--shalom-text)] sm:text-4xl ${shalomPublicDisplayClass}`}
        >
          Contact us
        </h1>
        {canEdit && editing ? (
          <ShalomEditableField
            label="Contact intro"
            value={content.contactIntro}
            editing={editing}
            onChange={(contactIntro) => patch({ contactIntro })}
            multiline
            className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[color:var(--shalom-muted)] sm:text-base"
          />
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--shalom-muted)] sm:text-base">
            {content.contactIntro}
          </p>
        )}
      </header>

      <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[1fr_1.4fr]">
        <aside className={`h-fit p-6 ${shalomPublicSurfaceClass}`}>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--shalom-muted)]">
            Direct contact
          </h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-[color:var(--shalom-muted)]">Phone</dt>
              <dd className="mt-1">
                {canEdit && editing ? (
                  <ShalomEditableField
                    label="Contact phone"
                    value={content.contactPhone}
                    editing={editing}
                    onChange={(contactPhone) => patch({ contactPhone })}
                  />
                ) : (
                  <a
                    href={shalomPublicContactTelHref(content.contactPhone)}
                    className="font-semibold text-[color:var(--shalom-accent)] hover:text-[color:var(--shalom-accent-hover)]"
                  >
                    {contactPhoneDisplay}
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[color:var(--shalom-muted)]">Email</dt>
              <dd className="mt-1">
                {canEdit && editing ? (
                  <ShalomEditableField
                    label="Contact email"
                    value={content.contactEmail}
                    editing={editing}
                    onChange={(contactEmail) => patch({ contactEmail })}
                  />
                ) : (
                  <a
                    href={`mailto:${content.contactEmail}`}
                    className="font-semibold text-[color:var(--shalom-text)] hover:text-[color:var(--shalom-accent)]"
                  >
                    {content.contactEmail}
                  </a>
                )}
              </dd>
            </div>
          </dl>
        </aside>

        <ShalomContactForm />
      </div>
    </section>
  );
}
