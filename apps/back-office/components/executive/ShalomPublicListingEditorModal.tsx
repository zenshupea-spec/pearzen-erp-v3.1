'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Loader2,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import {
  fetchShalomPublicListingEditorDraftAction,
  saveShalomPublicListingEditorDraftAction,
  uploadShalomPublicListingPhotoAction,
} from '../../app/executive/shalom-public-publish-actions';
import { compressShalomGuestIdFile } from '../../lib/shalom-guest-id-compress-client';
import {
  buildShalomPublicListingPreviewUrl,
  formatShalomAmenitiesInput,
  parseShalomAmenitiesInput,
  SHALOM_PUBLIC_LISTING_MAX_PHOTOS,
  suggestShalomPublicSlug,
  type ShalomPublicListingEditorDraft,
} from '../../lib/shalom-public-publish';
import type { ShalomPublicPropertyPhoto } from '../../../../packages/supabase/shalom-public-media-storage';
import { resolveShalomPublicMediaPublicUrl } from '../../../../packages/supabase/shalom-public-media-storage';

type GalleryPhoto = ShalomPublicPropertyPhoto & { publicUrl: string | null };

function mapGalleryPhotos(
  photos: ShalomPublicPropertyPhoto[],
  supabaseUrl: string,
): GalleryPhoto[] {
  return photos.map((photo, index) => ({
    ...photo,
    sortOrder: index,
    publicUrl: resolveShalomPublicMediaPublicUrl(supabaseUrl, photo.storageRef),
  }));
}

export default function ShalomPublicListingEditorModal({
  open,
  propertyId,
  propertyName,
  onClose,
  onSaved,
}: {
  open: boolean;
  propertyId: string;
  propertyName: string;
  onClose: () => void;
  onSaved?: (payload: { published: boolean; slug: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShalomPublicListingEditorDraft | null>(null);
  const [amenitiesInput, setAmenitiesInput] = useState('');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';

  const gallery = useMemo(
    () => (draft ? mapGalleryPhotos(draft.galleryPhotos, supabaseUrl) : []),
    [draft, supabaseUrl],
  );

  const previewUrl = useMemo(
    () => (draft ? buildShalomPublicListingPreviewUrl(draft.slug) : ''),
    [draft],
  );

  const loadDraft = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchShalomPublicListingEditorDraftAction(propertyId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setDraft(null);
      return;
    }
    setDraft(result.draft);
    setAmenitiesInput(formatShalomAmenitiesInput(result.draft.amenities));
  }, [propertyId]);

  useEffect(() => {
    if (open) {
      void loadDraft();
    } else {
      setDraft(null);
      setError(null);
      setSaveMessage(null);
      setSaving(false);
      setUploading(false);
    }
  }, [loadDraft, open]);

  const updateDraft = (patch: Partial<ShalomPublicListingEditorDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const reorderGallery = (fromIndex: number, toIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.galleryPhotos];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return current;
      next.splice(toIndex, 0, moved);
      return {
        ...current,
        galleryPhotos: next.map((photo, index) => ({ ...photo, sortOrder: index })),
      };
    });
  };

  const removePhoto = (photoId: string) => {
    setDraft((current) => {
      if (!current) return current;
      const removed = current.galleryPhotos.find((photo) => photo.id === photoId);
      const nextPhotos = current.galleryPhotos
        .filter((photo) => photo.id !== photoId)
        .map((photo, index) => ({ ...photo, sortOrder: index }));
      const nextHero =
        removed && current.heroImageUrl === removed.storageRef
          ? nextPhotos[0]?.storageRef ?? ''
          : current.heroImageUrl;
      return {
        ...current,
        galleryPhotos: nextPhotos,
        heroImageUrl: nextHero,
      };
    });
  };

  const setCoverPhoto = (storageRef: string) => {
    updateDraft({ heroImageUrl: storageRef });
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || !draft) return;
    const remaining = SHALOM_PUBLIC_LISTING_MAX_PHOTOS - draft.galleryPhotos.length;
    if (remaining <= 0) {
      setError(`Gallery supports at most ${SHALOM_PUBLIC_LISTING_MAX_PHOTOS} photos.`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const files = Array.from(fileList).slice(0, remaining);
      for (const file of files) {
        const compressed = await compressShalomGuestIdFile(file);
        const formData = new FormData();
        formData.append('file', compressed.file);
        const result = await uploadShalomPublicListingPhotoAction(propertyId, formData);
        if (!result.ok) {
          setError(result.error);
          continue;
        }

        setDraft((current) => {
          if (!current) return current;
          const nextPhotos = [...current.galleryPhotos, result.photo];
          const hero = current.heroImageUrl || result.storageRef;
          return {
            ...current,
            galleryPhotos: nextPhotos,
            heroImageUrl: hero,
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);

    const payload: ShalomPublicListingEditorDraft = {
      ...draft,
      amenities: parseShalomAmenitiesInput(amenitiesInput),
    };

    const result = await saveShalomPublicListingEditorDraftAction(payload);
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return;
    }

    const refreshed = await fetchShalomPublicListingEditorDraftAction(propertyId);
    setSaving(false);
    if (!refreshed.ok) {
      setError(
        'Save completed but the listing could not be reloaded. Refresh the page to confirm your changes.',
      );
      onSaved?.({ published: result.published, slug: result.slug });
      return;
    }

    setDraft(refreshed.draft);
    setAmenitiesInput(formatShalomAmenitiesInput(refreshed.draft.amenities));
    setSaveMessage(
      result.published
        ? 'Published on the guest website.'
        : 'Draft saved to Supabase. Toggle Publish when you are ready for guests to book.',
    );
    onSaved?.({ published: result.published, slug: result.slug });
  };

  if (!open) return null;

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/75 bg-[#eef2f6] shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-white/70 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-500 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Guest website listing
          </p>
          <h2 className="mt-0.5 text-xl font-black text-slate-900">{propertyName}</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Controls what guests see on shalom.pearzen.tech. Unpublished properties stay hidden.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading listing…
            </div>
          ) : !draft ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
              {error ?? 'Could not load listing.'}
            </p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/70 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Publish on guest website
                  </p>
                  <p className="text-xs text-slate-600">
                    {draft.published
                      ? 'Live on shalom.pearzen.tech after save.'
                      : 'Draft only — hidden from guests.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.published}
                  onClick={() => updateDraft({ published: !draft.published })}
                  className={`relative h-8 w-14 rounded-full transition ${
                    draft.published ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                      draft.published ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>URL slug</label>
                  <div className="flex gap-2">
                    <input
                      className={inputCls}
                      value={draft.slug}
                      onChange={(event) => updateDraft({ slug: event.target.value })}
                      placeholder="ocean-villa"
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                      onClick={() =>
                        updateDraft({ slug: suggestShalomPublicSlug(draft.name, draft.slug) })
                      }
                    >
                      Auto
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Sort order</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={draft.sortOrder}
                    onChange={(event) =>
                      updateDraft({ sortOrder: Number(event.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              {draft.slug.trim() ? (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:underline"
                >
                  Preview {previewUrl}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}

              <div>
                <label className={labelCls}>Headline</label>
                <input
                  className={inputCls}
                  value={draft.headline}
                  onChange={(event) => updateDraft({ headline: event.target.value })}
                  placeholder="Serene villa with garden views"
                />
              </div>

              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  className={`${inputCls} min-h-[120px] resize-y`}
                  value={draft.description}
                  onChange={(event) => updateDraft({ description: event.target.value })}
                  placeholder="Tell guests about the stay, neighbourhood, and highlights…"
                />
              </div>

              <div>
                <label className={labelCls}>Amenities (comma-separated)</label>
                <input
                  className={inputCls}
                  value={amenitiesInput}
                  onChange={(event) => setAmenitiesInput(event.target.value)}
                  placeholder="Wi-Fi, Parking, Air conditioning, Kitchen"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={labelCls}>Nightly rate (LKR)</label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={draft.nightlyRateLkr || ''}
                    onChange={(event) =>
                      updateDraft({ nightlyRateLkr: Number(event.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>Max guests (capacity)</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={draft.maxGuests || ''}
                    onChange={(event) =>
                      updateDraft({ maxGuests: Number(event.target.value) || 1 })
                    }
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Shown on the guest website and booking flow.
                  </p>
                </div>
                <div>
                  <label className={labelCls}>Bedrooms</label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={draft.bedrooms}
                    disabled
                  />
                  <p className="mt-1 text-[10px] text-slate-500">From MD property settings.</p>
                </div>
                <div>
                  <label className={labelCls}>Bathrooms</label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={draft.bathrooms ?? ''}
                    onChange={(event) =>
                      updateDraft({ bathrooms: Number(event.target.value) || 0 })
                    }
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Shown on the guest property page.</p>
                </div>
                <div>
                  <label className={labelCls}>Minimum nights</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={draft.minNights || ''}
                    onChange={(event) =>
                      updateDraft({ minNights: Number(event.target.value) || 1 })
                    }
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Shortest stay guests can book.</p>
                </div>
                <div>
                  <label className={labelCls}>Booking lead time (hours)</label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={draft.bookingLeadHours ?? ''}
                    onChange={(event) =>
                      updateDraft({ bookingLeadHours: Number(event.target.value) || 0 })
                    }
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Hours before 2:00 PM check-in that a guest must book.
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className={labelCls}>Property photos</p>
                    <p className="text-[10px] text-slate-500">
                      Drag to reorder · star sets cover image · {gallery.length}/
                      {SHALOM_PUBLIC_LISTING_MAX_PHOTOS}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={uploading || gallery.length >= SHALOM_PUBLIC_LISTING_MAX_PHOTOS}
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    Add photos
                  </button>
                </div>

                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleFiles(event.dataTransfer.files);
                  }}
                  className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-5 text-center"
                >
                  {gallery.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Drop JPEG/PNG/WebP images here or use Add photos.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {gallery.map((photo, index) => {
                        const isCover = draft.heroImageUrl === photo.storageRef;
                        return (
                          <div
                            key={photo.id}
                            draggable
                            onDragStart={() => setDraggingId(photo.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              if (!draggingId || draggingId === photo.id) return;
                              const fromIndex = gallery.findIndex((row) => row.id === draggingId);
                              if (fromIndex >= 0) reorderGallery(fromIndex, index);
                              setDraggingId(null);
                            }}
                            className={`flex items-center gap-3 rounded-xl border bg-white p-2 text-left ${
                              isCover ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
                            }`}
                          >
                            <GripVertical className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            <div className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                              {photo.publicUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={photo.publicUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[10px] font-semibold text-slate-700">
                                {isCover ? 'Cover photo' : `Photo ${index + 1}`}
                              </p>
                              <p className="truncate font-mono text-[9px] text-slate-400">
                                {photo.storageRef}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="Set cover"
                                onClick={() => setCoverPhoto(photo.storageRef)}
                                className={`rounded-lg p-1.5 ${
                                  isCover
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'text-slate-400 hover:bg-slate-100 hover:text-emerald-700'
                                }`}
                              >
                                <Star className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Move up"
                                disabled={index === 0}
                                onClick={() => reorderGallery(index, index - 1)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Move down"
                                disabled={index === gallery.length - 1}
                                onClick={() => reorderGallery(index, index + 1)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Remove"
                                onClick={() => removePhoto(photo.id)}
                                className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleFiles(event.target.files)}
                />
              </div>

              {saveMessage ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                  {saveMessage}
                </p>
              ) : null}
              {error ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!draft || saving || loading}
            onClick={() => void handleSave()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveMessage ? 'Saved' : draft?.published ? 'Save & publish' : 'Save draft'}
          </button>
        </div>
      </div>
    </div>
  );
}
