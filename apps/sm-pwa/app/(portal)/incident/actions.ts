'use server'

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { getSMAssignments, resolveSmSessionEpf } from '../../../lib/sm-assignments';

const BUCKET = 'incident-recordings';

async function uploadAudio(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  file: File,
  path: string,
): Promise<string | null> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'audio/webm',
    upsert: false,
  });
  if (error) {
    console.error('[SM Incident] Audio upload error:', error.message);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function reportIncidentAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const epf = await resolveSmSessionEpf();
  const ts = Date.now();

  const siteName = (formData.get('site_name') as string)?.trim();
  const incidentType = formData.get('incident_type') as string;
  const severity = formData.get('severity') as string;
  const guardsRaw = (formData.get('guards_involved') as string)?.trim();

  const { sites: allowedSites, guards: allowedGuards } = await getSMAssignments(epf);
  const allowedSiteNames = new Set(allowedSites.map(s => s.value));
  const allowedGuardEpfs = new Set(allowedGuards.map(g => g.value));

  if (allowedSiteNames.size > 0 && !siteName) {
    return { error: 'Please select a site from your assigned list.' };
  }

  if (siteName && !allowedSiteNames.has(siteName)) {
    return { error: 'Selected site is not in your assigned list.' };
  }

  const descriptionAudio = formData.get('description_audio') as File | null;
  const actionAudio = formData.get('action_audio') as File | null;

  if (!incidentType) return { error: 'Incident type is required.' };
  if (!descriptionAudio || descriptionAudio.size === 0) return { error: 'A voice recording for the description is required.' };

  const descExt = descriptionAudio.name.endsWith('mp4') ? 'mp4' : 'webm';
  const descPath = `${epf}/${ts}_description.${descExt}`;
  const descUrl = await uploadAudio(supabase, descriptionAudio, descPath);
  if (!descUrl) return { error: 'Failed to upload description recording. Please try again.' };

  let actionUrl: string | null = null;
  if (actionAudio && actionAudio.size > 0) {
    const actExt = actionAudio.name.endsWith('mp4') ? 'mp4' : 'webm';
    const actPath = `${epf}/${ts}_action.${actExt}`;
    actionUrl = await uploadAudio(supabase, actionAudio, actPath);
  }

  const guardsInvolved = guardsRaw
    ? guardsRaw.split(',').map(g => g.trim().toUpperCase()).filter(Boolean)
    : [];

  const invalidGuard = guardsInvolved.find(g => !allowedGuardEpfs.has(g));
  if (invalidGuard) {
    return { error: 'One or more selected guards are not assigned to you.' };
  }

  const { error } = await supabase.from('sm_incident_reports').insert({
    sm_epf: epf,
    site_name: siteName || null,
    incident_type: incidentType,
    severity: severity || 'MEDIUM',
    description: descUrl,
    guards_involved: guardsInvolved,
    action_taken: actionUrl,
    status: 'OPEN',
  });

  if (error) {
    console.error('[SM Incident] Insert error:', error.message);
    return { error: 'Failed to submit incident report. Please try again.' };
  }

  return { success: true };
}
