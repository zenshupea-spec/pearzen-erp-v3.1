export type SecurityWebsiteImageSlot =
  | 'logo'
  | 'hero'
  | 'about'
  | 'tech'
  | 'timelineCoverage'
  | 'timelineMonitoring';

/** Strip `?v=` / `?t=` cache-busters before persisting image URLs. */
export function stripImageCacheBuster(url: string | null | undefined): string | null {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return null;
  return trimmed.replace(/[?&](?:v|t)=\d+$/, '');
}

/** Bust browser/CDN cache after overwriting a storage object at a stable public URL. */
export function withImageCacheBuster(url: string): string {
  const clean = stripImageCacheBuster(url) ?? url;
  const separator = clean.includes('?') ? '&' : '?';
  return `${clean}${separator}v=${Date.now()}`;
}

export function needsImageCacheBuster(url: string | null | undefined): boolean {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  return (
    trimmed.includes('supabase.co/storage') && !/[?&](?:v|t)=\d+/.test(trimmed)
  );
}
