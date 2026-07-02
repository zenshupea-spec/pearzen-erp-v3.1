import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  DEFAULT_PEARZEN_WEBSITE_CONTENT,
  mergePearzenWebsiteContent,
  type PearzenWebsiteContent,
} from './pearzen-website-types';

export async function fetchPearzenWebsiteContent(): Promise<PearzenWebsiteContent> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase.rpc('get_pearzen_public_website');

  if (error) {
    console.error('fetchPearzenWebsiteContent rpc:', error.message);
    const { data: row, error: rowError } = await supabase
      .from('forge_settings')
      .select('pearzen_website_content')
      .eq('singleton', true)
      .maybeSingle();

    if (rowError) {
      console.error('fetchPearzenWebsiteContent fallback:', rowError.message);
      return DEFAULT_PEARZEN_WEBSITE_CONTENT;
    }

    return mergePearzenWebsiteContent(
      (row as { pearzen_website_content?: unknown } | null)?.pearzen_website_content,
    );
  }

  return mergePearzenWebsiteContent(data);
}

export async function savePearzenWebsiteContent(
  content: PearzenWebsiteContent,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createSupabaseServiceClient();
  const normalized = mergePearzenWebsiteContent(content);

  const { error } = await supabase
    .from('forge_settings')
    .upsert(
      {
        singleton: true,
        pearzen_website_content: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'singleton' },
    );

  if (error) {
    console.error('savePearzenWebsiteContent:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}
