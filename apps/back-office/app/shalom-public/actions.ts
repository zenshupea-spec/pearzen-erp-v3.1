'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import {
  fetchPublishedShalomListings,
  fetchShalomPublicPropertyCatalog,
  resolveShalomPublicEditorCompanyId,
} from '../../lib/shalom-public-data';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { isExecutiveRank } from '../../lib/portal-role-utils';
import {
  fetchShalomPublicWebsiteContent,
  saveShalomPublicWebsiteContent,
} from '../../lib/shalom-public-website-data';
import { uploadShalomPublicWebsiteSiteImageFromDataUrl } from '../../lib/shalom-public-website-images';
import {
  mergeShalomPublicWebsiteContent,
  type ShalomPublicWebsiteContent,
} from '../../lib/shalom-public-website-types';
import type { ShalomPublicListingView, ShalomPublicPropertyCatalogItem } from '../../lib/shalom-public-listings';

export type ShalomPublicWebsiteLayoutData = {
  content: Awaited<ReturnType<typeof fetchShalomPublicWebsiteContent>>;
  canEdit: boolean;
  listings: ShalomPublicListingView[];
  propertyCatalog: ShalomPublicPropertyCatalogItem[];
};

async function resolveShalomWebsiteEditorCompanyId(): Promise<string> {
  return resolveShalomPublicEditorCompanyId();
}

async function requireWebsiteEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Please sign in again.');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    throw new Error('Only MD, OD, FM, or EA can edit the guest website.');
  }

  const companyId = await resolveShalomWebsiteEditorCompanyId();
  if (!companyId) throw new Error('Tenant company not resolved for this session.');

  return { companyId, profile, actorEmail: user.email ?? null };
}

function revalidateShalomPublicPaths() {
  revalidatePath('/shalom-public', 'layout');
  revalidatePath('/dashboard');
}

export async function getShalomPublicWebsiteLayoutData(): Promise<ShalomPublicWebsiteLayoutData> {
  const [content, listings, propertyCatalog] = await Promise.all([
    fetchShalomPublicWebsiteContent(),
    fetchPublishedShalomListings(),
    fetchShalomPublicPropertyCatalog(),
  ]);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { content, canEdit: false, listings, propertyCatalog: [] };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const canEdit = isExecutiveRank(profile.role);
  return {
    content,
    canEdit,
    listings,
    propertyCatalog: canEdit ? propertyCatalog : [],
  };
}

export async function saveShalomPublicWebsiteContentAction(
  content: ShalomPublicWebsiteContent,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { companyId } = await requireWebsiteEditor();
    const normalized = mergeShalomPublicWebsiteContent(content);
    const result = await saveShalomPublicWebsiteContent(companyId, normalized);
    if (!result.success) return result;

    revalidateShalomPublicPaths();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save website content.';
    return { success: false, error: message };
  }
}

export async function uploadShalomPublicWebsiteLogoImageAction(
  dataUrl: string,
): Promise<{ success: boolean; logoImageUrl?: string; publicUrl?: string | null; error?: string }> {
  return uploadShalomPublicWebsiteSiteImageFromDataUrlAction(dataUrl, 'logo');
}

async function uploadShalomPublicWebsiteSiteImageFromDataUrlAction(
  dataUrl: string,
  slot: 'hero' | 'logo',
): Promise<{ success: boolean; heroImageUrl?: string; logoImageUrl?: string; publicUrl?: string | null; error?: string }> {
  try {
    const { companyId } = await requireWebsiteEditor();

    const uploaded = await uploadShalomPublicWebsiteSiteImageFromDataUrl(companyId, slot, dataUrl);
    if (!uploaded.success || !uploaded.storageRef) {
      return { success: false, error: uploaded.error ?? 'Upload failed.' };
    }

    const existing = await fetchShalomPublicWebsiteContent(companyId);
    const saveResult = await saveShalomPublicWebsiteContent(companyId, {
      ...existing,
      ...(slot === 'hero'
        ? { heroImageUrl: uploaded.storageRef }
        : { logoImageUrl: uploaded.storageRef }),
    });

    if (!saveResult.success) {
      return {
        success: false,
        error: saveResult.error ?? 'Upload saved but website content failed.',
      };
    }

    revalidateShalomPublicPaths();
    return {
      success: true,
      publicUrl: uploaded.publicUrl,
      ...(slot === 'hero'
        ? { heroImageUrl: uploaded.storageRef }
        : { logoImageUrl: uploaded.storageRef }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.';
    if (message.includes('Body exceeded')) {
      return { success: false, error: 'Image is too large. Try a smaller photo.' };
    }
    return { success: false, error: message };
  }
}

export async function uploadShalomPublicWebsiteHeroImageAction(
  dataUrl: string,
): Promise<{ success: boolean; heroImageUrl?: string; publicUrl?: string | null; error?: string }> {
  const result = await uploadShalomPublicWebsiteSiteImageFromDataUrlAction(dataUrl, 'hero');
  return {
    success: result.success,
    heroImageUrl: result.heroImageUrl,
    publicUrl: result.publicUrl,
    error: result.error,
  };
}
