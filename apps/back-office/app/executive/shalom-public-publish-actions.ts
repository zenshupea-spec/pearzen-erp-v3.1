'use server';

import {
  fetchShalomPublicListingEditorDraft,
  saveShalomPublicListingEditorDraft,
  uploadShalomPublicListingPhoto,
} from '../../lib/shalom-public-publish-server';
import type { ShalomPublicListingEditorDraft } from '../../lib/shalom-public-publish';

export async function fetchShalomPublicListingEditorDraftAction(propertyId: string) {
  return fetchShalomPublicListingEditorDraft(propertyId);
}

export async function saveShalomPublicListingEditorDraftAction(
  draft: ShalomPublicListingEditorDraft,
) {
  return saveShalomPublicListingEditorDraft(draft);
}

export async function uploadShalomPublicListingPhotoAction(
  propertyId: string,
  formData: FormData,
) {
  return uploadShalomPublicListingPhoto(propertyId, formData);
}
