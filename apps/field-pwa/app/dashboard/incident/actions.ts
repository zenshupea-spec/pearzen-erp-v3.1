'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, createSupabaseServiceClient } from '../../../../../packages/supabase/server';
import { resolveGuardSession } from '../../../lib/guard-auth';

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
    console.error('[Guard Incident] Audio upload error:', error.message);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function submitIncident(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const service = createSupabaseServiceClient();
  const { rosterKey } = await resolveGuardSession(service, session.user.email);
  if (!rosterKey) redirect('/login');
  const empNumber = rosterKey;
  const ts = Date.now();

  const descriptionAudio = formData.get('description_audio') as File | null;
  const actionAudio = formData.get('action_audio') as File | null;

  if (!descriptionAudio || descriptionAudio.size === 0) {
    return { success: false, error: 'A voice recording for the description is required.' };
  }

  const descExt = descriptionAudio.name.endsWith('mp4') ? 'mp4' : 'webm';
  const descPath = `guard/${empNumber}/${ts}_description.${descExt}`;
  const descUrl = await uploadAudio(supabase, descriptionAudio, descPath);
  if (!descUrl) {
    return { success: false, error: 'Failed to upload description recording. Please try again.' };
  }

  let actionUrl: string | null = null;
  if (actionAudio && actionAudio.size > 0) {
    const actExt = actionAudio.name.endsWith('mp4') ? 'mp4' : 'webm';
    const actPath = `guard/${empNumber}/${ts}_action.${actExt}`;
    actionUrl = await uploadAudio(supabase, actionAudio, actPath);
  }

  const description = actionUrl ? `${descUrl}|action:${actionUrl}` : descUrl;

  const { error } = await supabase.from('incidents').insert([
    {
      emp_number: empNumber,
      description,
      status: 'PENDING',
    },
  ]);

  if (error) {
    console.error('[Guard Incident] Insert error:', error.message);
    return { success: false, error: 'Failed to submit incident report. Please try again.' };
  }

  revalidatePath('/');
  return { success: true };
}
