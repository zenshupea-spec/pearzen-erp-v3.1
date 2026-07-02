'use server';

import { revalidatePath } from 'next/cache';

import { isForgeOperatorEmail } from '../../../lib/forge-access';
import {
  mapForgeWebsiteTemplateRow,
  type ForgeWebsiteTemplateRecord,
} from '../../../lib/forge-website-templates';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Project → Environment Variables, then redeploy.',
    );
  }
}

async function assertForgeOperator() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    throw new Error('Forge operator access required');
  }
  return user.email;
}

export async function fetchForgeWebsiteTemplates() {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_website_templates')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return { success: true as const, templates: [] as ForgeWebsiteTemplateRecord[] };
      }
      throw new Error(error.message);
    }

    return {
      success: true as const,
      templates: (data ?? []).map((row) =>
        mapForgeWebsiteTemplateRow(row as Record<string, unknown>),
      ),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load templates';
    return {
      success: false as const,
      error: message,
      templates: [] as ForgeWebsiteTemplateRecord[],
    };
  }
}

export async function fetchForgeWebsiteTemplateBySlug(slug: string) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const normalized = slug?.trim();
    if (!normalized) {
      return { success: false as const, error: 'Missing template slug', template: null };
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_website_templates')
      .select('*')
      .eq('slug', normalized)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        return { success: false as const, error: 'Template table not migrated yet', template: null };
      }
      throw new Error(error.message);
    }

    if (!data) {
      return { success: false as const, error: 'Template not found', template: null };
    }

    return {
      success: true as const,
      template: mapForgeWebsiteTemplateRow(data as Record<string, unknown>),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load template';
    return { success: false as const, error: message, template: null };
  }
}

export type UpdateForgeWebsiteTemplateInput = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  vertical: string;
  contentJson: Record<string, unknown>;
  previewImageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
};

export async function updateForgeWebsiteTemplate(input: UpdateForgeWebsiteTemplateInput) {
  try {
    assertServiceRoleConfigured();
    await assertForgeOperator();

    const slug = input.slug?.trim();
    if (!slug) throw new Error('Missing template slug');
    if (!input.name?.trim()) throw new Error('Template name is required');

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_website_templates')
      .update({
        name: input.name.trim(),
        tagline: input.tagline?.trim() || null,
        description: input.description?.trim() || null,
        vertical: input.vertical?.trim() || 'general',
        content_json: input.contentJson ?? {},
        preview_image_url: input.previewImageUrl?.trim() || null,
        sort_order: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
        is_active: input.isActive,
        is_featured: input.isFeatured,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', slug)
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') throw new Error('Template table not migrated yet');
      throw new Error(error.message);
    }
    if (!data) throw new Error('Template not found');

    revalidatePath('/forge/templates');
    revalidatePath(`/forge/templates/${slug}`);

    return {
      success: true as const,
      template: mapForgeWebsiteTemplateRow(data as Record<string, unknown>),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save template';
    return { success: false as const, error: message };
  }
}
