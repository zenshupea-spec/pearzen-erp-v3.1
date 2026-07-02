import 'server-only';

import { randomUUID } from 'crypto';

import { revalidatePath } from 'next/cache';

import {
  parseShalomPublicPropertyPhotos,
  SHALOM_PUBLIC_MEDIA_UPLOAD_MAX_BYTES,
  uploadShalomPropertyPhoto,
} from '../../../packages/supabase/shalom-public-media-storage';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import { fetchBackOfficeUserProfile } from './hr-portal-access-server';
import { normalizePortalRole } from './portal-role-utils';
import {
  buildShalomPublicListingSaveRow,
  suggestShalomPublicSlug,
  type ShalomPublicListingEditorDraft,
  validateShalomPublicListingDraft,
} from './shalom-public-publish';
import {
  mapShalomPublicListingFromRow,
  normalizeShalomPublicSlug,
  parseShalomPropertyDefaultRateLkr,
} from './shalom-public-listings';
import { resolveShalomPublicEditorCompanyId } from './shalom-public-data';

const SHALOM_EXECUTIVE_PATH = '/executive/shalom';

async function requireExecutiveRole() {
  const { createSupabaseServerClient } = await import('../../../packages/supabase/server');
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (role !== 'MD' && role !== 'OD') throw new Error('Forbidden');
  return user;
}

async function resolveListingEditorCompanyId() {
  return resolveShalomPublicEditorCompanyId();
}

function mapDraftFromRow(row: Record<string, unknown>): ShalomPublicListingEditorDraft | null {
  const listing = mapShalomPublicListingFromRow(row);
  if (!listing) return null;

  return {
    propertyId: listing.id,
    name: listing.name,
    location: listing.location,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    published: Boolean(row.public_published),
    slug: listing.slug || suggestShalomPublicSlug(listing.name),
    headline: listing.headline || listing.name,
    description: listing.description,
    heroImageUrl: listing.heroImageUrl,
    galleryPhotos: listing.galleryPhotos,
    nightlyRateLkr: listing.nightlyRateLkr || parseShalomPropertyDefaultRateLkr(row.settings),
    maxGuests: listing.maxGuests || Math.max(2, listing.bedrooms * 2),
    minNights: listing.minNights,
    bookingLeadHours: listing.bookingLeadHours,
    amenities: listing.amenities,
    sortOrder: listing.sortOrder,
  };
}

export async function fetchShalomPublicListingEditorDraft(
  propertyId: string,
): Promise<{ ok: true; draft: ShalomPublicListingEditorDraft } | { ok: false; error: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveListingEditorCompanyId();

    const normalizedId = propertyId.trim();
    if (!normalizedId) return { ok: false, error: 'Property is required.' };

    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from('shalom_properties')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', normalizedId)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, error: error?.message ?? 'Property not found.' };
    }

    const draft = mapDraftFromRow(data as Record<string, unknown>);
    if (!draft) return { ok: false, error: 'Could not load listing draft.' };

    return { ok: true, draft };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to load listing.',
    };
  }
}

async function loadCompanyPublicSlugs(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
): Promise<Array<{ propertyId: string; slug: string }>> {
  const { data } = await db
    .from('shalom_properties')
    .select('id, public_slug')
    .eq('company_id', companyId);

  return (data ?? [])
    .map((row) => ({
      propertyId: String(row.id),
      slug: typeof row.public_slug === 'string' ? normalizeShalomPublicSlug(row.public_slug) : '',
    }))
    .filter((row) => row.slug);
}

export async function saveShalomPublicListingEditorDraft(
  draft: ShalomPublicListingEditorDraft,
): Promise<{ ok: true; published: boolean; slug: string } | { ok: false; error: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveListingEditorCompanyId();

    const db = createSupabaseServiceClient();
    const existingSlugs = await loadCompanyPublicSlugs(db, companyId);
    const validation = validateShalomPublicListingDraft(draft, existingSlugs);
    if (!validation.ok) {
      return { ok: false, error: validation.errors.join(' ') };
    }

    const row = buildShalomPublicListingSaveRow(draft);
    const { data: updated, error } = await db
      .from('shalom_properties')
      .update({
        ...row,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', draft.propertyId)
      .select('id, public_slug, public_published')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: 'This URL slug is already used by another property.' };
      }
      return { ok: false, error: error.message };
    }

    if (!updated) {
      return {
        ok: false,
        error: 'Property not found for this tenant. Sign in on the correct company portal and try again.',
      };
    }

    revalidatePath(SHALOM_EXECUTIVE_PATH);
    revalidatePath('/shalom-public', 'layout');
    revalidatePath('/shalom-public/properties', 'layout');

    return {
      ok: true,
      published: Boolean(updated.public_published),
      slug: typeof updated.public_slug === 'string' ? updated.public_slug : row.public_slug,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save listing.',
    };
  }
}

export async function uploadShalomPublicListingPhoto(
  propertyId: string,
  formData: FormData,
): Promise<
  | {
      ok: true;
      storageRef: string;
      publicUrl: string | null;
      photo: { id: string; storageRef: string; sortOrder: number };
    }
  | { ok: false; error: string }
> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveListingEditorCompanyId();

    const normalizedId = propertyId.trim();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'Choose an image to upload.' };
    }

    const contentType = (file.type || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return { ok: false, error: 'Upload a JPEG, PNG, or WebP image.' };
    }

    if (file.size > SHALOM_PUBLIC_MEDIA_UPLOAD_MAX_BYTES) {
      return { ok: false, error: 'Image must be 5 MB or smaller.' };
    }

    const db = createSupabaseServiceClient();
    const { data: property, error: propertyError } = await db
      .from('shalom_properties')
      .select('id, public_gallery_urls')
      .eq('company_id', companyId)
      .eq('id', normalizedId)
      .maybeSingle();

    if (propertyError || !property) {
      return { ok: false, error: propertyError?.message ?? 'Property not found.' };
    }

    const existing = parseShalomPublicPropertyPhotos(property.public_gallery_urls);
    if (existing.length >= 12) {
      return { ok: false, error: 'Gallery is full (12 photos max).' };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadShalomPropertyPhoto(db, {
      companyId,
      propertyId: normalizedId,
      bytes,
      contentType,
    });

    const photo = {
      id: randomUUID(),
      storageRef: uploaded.storageRef,
      sortOrder: existing.length,
    };

    return {
      ok: true,
      storageRef: uploaded.storageRef,
      publicUrl: uploaded.publicUrl,
      photo,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Upload failed.',
    };
  }
}
