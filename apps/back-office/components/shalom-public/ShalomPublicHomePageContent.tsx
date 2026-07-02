'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import ShalomPublicListingEditorModal from '../executive/ShalomPublicListingEditorModal';
import ShalomPropertyCard from './ShalomPropertyCard';
import ShalomPublicHomeHero from './ShalomPublicHomeHero';
import { shalomPublicDisplayClass, shalomPublicSurfaceClass } from '../../lib/shalom-public-tokens';
import type { ShalomPublicPropertyCatalogItem } from '../../lib/shalom-public-listings';
import { useShalomPublicWebsite } from './ShalomPublicWebsiteContext';
import {
  ShalomEditableField,
  useShalomPublicWebsiteEdit,
} from './ShalomPublicWebsiteEditProvider';

function PropertySetupCard({
  item,
  onEdit,
}: {
  item: ShalomPublicPropertyCatalogItem;
  onEdit: () => void;
}) {
  const title = item.headline.trim() || item.name;

  return (
    <div className={`relative p-5 ${shalomPublicSurfaceClass}`}>
      <p className={`text-lg font-semibold uppercase tracking-[0.1em] text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}>
        {title}
      </p>
      {item.location ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--shalom-muted)]">
          {item.location}
        </p>
      ) : null}
      {item.setupHint ? (
        <p className="mt-3 text-sm leading-relaxed text-amber-800">{item.setupHint}</p>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        className="mt-4 rounded-lg bg-[color:var(--shalom-accent)] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white"
      >
        Set up listing
      </button>
    </div>
  );
}

export default function ShalomPublicHomePageContent() {
  const router = useRouter();
  const { listings, propertyCatalog, canEdit } = useShalomPublicWebsite();
  const { editing, content, patch } = useShalomPublicWebsiteEdit();
  const [editorProperty, setEditorProperty] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const displayItems = useMemo(() => {
    if (canEdit && editing && propertyCatalog.length > 0) {
      return propertyCatalog;
    }
    return listings;
  }, [canEdit, editing, listings, propertyCatalog]);

  const bookableCount = listings.length;

  return (
    <>
      <ShalomPublicHomeHero />

      <section className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            {canEdit && editing ? (
              <ShalomEditableField
                label="Properties section title"
                value={content.propertiesSectionTitle}
                editing={editing}
                onChange={(propertiesSectionTitle) => patch({ propertiesSectionTitle })}
                className={`text-2xl font-semibold text-[color:var(--shalom-text)] sm:text-3xl ${shalomPublicDisplayClass}`}
              />
            ) : (
              <h2
                className={`text-2xl font-semibold text-[color:var(--shalom-text)] sm:text-3xl ${shalomPublicDisplayClass}`}
              >
                {content.propertiesSectionTitle}
              </h2>
            )}
            <p className="mt-2 text-sm text-[color:var(--shalom-muted)]">
              {bookableCount > 0
                ? `${bookableCount} ${bookableCount === 1 ? 'stay' : 'stays'} available to book`
                : canEdit && editing && propertyCatalog.length > 0
                  ? `${propertyCatalog.length} ${propertyCatalog.length === 1 ? 'property' : 'properties'} in MD portal — finish setup below`
                  : 'New stays are being prepared'}
            </p>
          </div>
        </div>

        {displayItems.length > 0 ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {displayItems.map((item) => {
              const isCatalogItem = canEdit && editing && propertyCatalog.length > 0;
              const showBookableCard =
                !isCatalogItem || ('bookable' in item && (item as ShalomPublicPropertyCatalogItem).bookable);
              const openEditor = () =>
                setEditorProperty({ id: item.id, name: item.name || item.headline });

              return (
                <li key={item.id} className="relative">
                  {showBookableCard ? (
                    <>
                      <ShalomPropertyCard listing={item} />
                      {canEdit && editing ? (
                        <button
                          type="button"
                          onClick={openEditor}
                          className="absolute right-3 top-3 rounded-lg bg-[color:var(--shalom-accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-md"
                        >
                          Edit listing
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <PropertySetupCard item={item as ShalomPublicPropertyCatalogItem} onEdit={openEditor} />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={`px-6 py-12 text-center ${shalomPublicSurfaceClass}`}>
            {canEdit && editing ? (
              <div className="mx-auto max-w-md space-y-4">
                <ShalomEditableField
                  label="Empty state title"
                  value={content.propertiesEmptyTitle}
                  editing={editing}
                  onChange={(propertiesEmptyTitle) => patch({ propertiesEmptyTitle })}
                  className={`text-xl font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
                />
                <ShalomEditableField
                  label="Empty state description"
                  value={content.propertiesEmptyDescription}
                  editing={editing}
                  onChange={(propertiesEmptyDescription) => patch({ propertiesEmptyDescription })}
                  multiline
                  className="text-sm leading-relaxed text-[color:var(--shalom-muted)]"
                />
                <p className="text-sm text-[color:var(--shalom-muted)]">
                  Add properties in the MD Shalom desk, then use <strong>Set up listing</strong> here
                  to add photos, nightly rate, and publish.
                </p>
              </div>
            ) : (
              <>
                <p
                  className={`text-xl font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
                >
                  {content.propertiesEmptyTitle}
                </p>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[color:var(--shalom-muted)]">
                  {content.propertiesEmptyDescription}
                </p>
              </>
            )}
            <a
              href={`mailto:${content.contactEmail}`}
              className="mt-6 inline-block text-sm font-semibold text-[color:var(--shalom-accent)] hover:text-[color:var(--shalom-accent-hover)]"
            >
              {content.contactEmail}
            </a>
          </div>
        )}
      </section>

      {editorProperty ? (
        <ShalomPublicListingEditorModal
          open
          propertyId={editorProperty.id}
          propertyName={editorProperty.name}
          onClose={() => setEditorProperty(null)}
          onSaved={() => {
            setEditorProperty(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
