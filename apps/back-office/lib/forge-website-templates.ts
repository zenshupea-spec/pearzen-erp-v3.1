/** Forge website template gallery — DB row shape for `forge_website_templates`. */

import type { TenantPublicSiteType } from './tenant-public-site-types';

export const FORGE_WEBSITE_TEMPLATE_VERTICALS = [
  'general',
  'cafe',
  'retail',
  'salon',
  'security',
  'hospitality',
] as const;

export type ForgeWebsiteTemplateVertical = (typeof FORGE_WEBSITE_TEMPLATE_VERTICALS)[number];

export type ForgeWebsiteTemplateRecord = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  siteType: TenantPublicSiteType;
  vertical: string;
  contentJson: Record<string, unknown>;
  previewImageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
};

export function forgeWebsiteTemplateVerticalLabel(vertical: string): string {
  switch (vertical) {
    case 'general':
      return 'General';
    case 'cafe':
      return 'Café';
    case 'retail':
      return 'Retail';
    case 'salon':
      return 'Salon & beauty';
    case 'security':
      return 'Security';
    case 'hospitality':
      return 'Hospitality';
    default:
      return vertical.replace(/_/g, ' ');
  }
}

export function mapForgeWebsiteTemplateRow(row: Record<string, unknown>): ForgeWebsiteTemplateRecord {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? 'Template'),
    tagline: row.tagline != null ? String(row.tagline) : null,
    description: row.description != null ? String(row.description) : null,
    siteType: String(row.site_type) as TenantPublicSiteType,
    vertical: String(row.vertical ?? 'general'),
    contentJson:
      row.content_json && typeof row.content_json === 'object' && !Array.isArray(row.content_json)
        ? (row.content_json as Record<string, unknown>)
        : {},
    previewImageUrl: row.preview_image_url != null ? String(row.preview_image_url) : null,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active ?? true),
    isFeatured: Boolean(row.is_featured ?? false),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}
