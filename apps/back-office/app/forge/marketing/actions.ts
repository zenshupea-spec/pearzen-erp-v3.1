'use server';

import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { assertForgeOperator } from '../../../lib/forge-operator-server';

export async function fetchPearzenMarketingMeta() {
  try {
    await assertForgeOperator();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_settings')
      .select('updated_at')
      .eq('singleton', true)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        return { success: true as const, updatedAt: null };
      }
      throw new Error(error.message);
    }

    return {
      success: true as const,
      updatedAt: data?.updated_at != null ? String(data.updated_at) : null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load marketing meta';
    return { success: false as const, error: message, updatedAt: null };
  }
}
