import type { ShalomPublicListingView } from '../../lib/shalom-public-listings';

export type ShalomPropertyGalleryImage = {
  url: string;
  alt: string;
};

/** Hero first, then gallery — deduped by URL. */
export function collectShalomPropertyGalleryImages(
  listing: ShalomPublicListingView,
): ShalomPropertyGalleryImage[] {
  const title = listing.headline.trim() || listing.name;
  const seen = new Set<string>();
  const images: ShalomPropertyGalleryImage[] = [];

  const push = (url: string | null | undefined, alt: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, alt });
  };

  push(listing.heroImagePublicUrl, title);
  for (const photo of listing.galleryPhotos) {
    push(photo.publicUrl, photo.caption?.trim() || title);
  }

  return images;
}
