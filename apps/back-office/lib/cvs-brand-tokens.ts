/**
 * CVS / Executive portal brand tokens — single source for accent colours.
 *
 * Default: emerald-600 palette (Executive Vault PRD).
 *
 * Tenant override (optional): set in Supabase `md_settings.setting_value`:
 * ```json
 * { "_portalBrandTheme": { "accentHex": "#1e4d8c", "accentHoverHex": "#2563eb", "glowHex": "#1e4d8c" } }
 * ```
 *
 * CSS variables applied at layout root:
 * `--cvs-accent`, `--cvs-accent-hover`, `--cvs-accent-soft`, `--cvs-accent-muted`,
 * `--cvs-glow`, `--cvs-glow-teal`, `--cvs-glow-lime`
 */
import type { CSSProperties } from 'react';

/** Optional MD overrides stored in md_settings.setting_value._portalBrandTheme */
export type PortalBrandThemeOverrides = {
  accentHex?: string;
  accentHoverHex?: string;
  glowHex?: string;
};

export type CvsBrandTokenSource = 'default' | 'md_settings';

export type CvsBrandTokens = {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentMuted: string;
  /** Primary ambient glow (vault canvas top-right). */
  glow: string;
  /** Secondary teal-shifted glow (vault canvas left). */
  glowTeal: string;
  /** Tertiary lime-shifted glow (vault canvas bottom). */
  glowLime: string;
  source: CvsBrandTokenSource;
};

/** Emerald palette — matches Executive Vault PRD when no tenant override is set. */
export const DEFAULT_CVS_BRAND_TOKENS: CvsBrandTokens = {
  accent: '#059669',
  accentHover: '#10b981',
  accentSoft: '#ecfdf5',
  accentMuted: '#a7f3d0',
  glow: 'rgba(52, 211, 153, 0.28)',
  glowTeal: 'rgba(45, 212, 191, 0.22)',
  glowLime: 'rgba(163, 230, 53, 0.18)',
  source: 'default',
};

/** Tailwind class bundles for layout chrome — import instead of hard-coding indigo/emerald. */
export const CVS_BRAND_CLASSES = {
  navActive: 'bg-[var(--cvs-accent-soft)] shadow-sm ring-1 ring-[color:var(--cvs-accent-muted)]',
  navActiveIcon:
    'border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] group-hover:border-[color:var(--cvs-accent-muted)] group-hover:bg-[var(--cvs-accent-soft)]',
  navActiveIconFg: 'text-[color:var(--cvs-accent)] group-hover:text-[color:var(--cvs-accent-hover)]',
  navActiveLabel: 'text-[color:var(--cvs-accent)]',
  navActiveSub: 'text-[color:var(--cvs-accent-hover)]',
  navChevron: 'text-[color:var(--cvs-accent-hover)]',
  rankBadge:
    'border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] text-[color:var(--cvs-accent)]',
  portalEyebrow: 'text-[color:var(--cvs-accent-hover)]',
  portalDot: 'bg-[color:var(--cvs-accent-hover)]',
  mobileTabActive:
    'border-[color:var(--cvs-accent-muted)] bg-[color:var(--cvs-accent)] text-white shadow-md shadow-[color:var(--cvs-glow)]',
  mobileTabIdle:
    'border-slate-200/80 bg-white text-slate-700 shadow-sm hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]',
  focusRing: 'focus:ring-[color:var(--cvs-accent)]/40 focus:border-[color:var(--cvs-accent-muted)]',
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.length === 6 ? raw : null;
  if (!full || !/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHex(a: string, b: string, ratio: number): string {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  if (!ar || !br) return a;
  const t = clamp(ratio, 0, 1);
  return rgbToHex(
    ar[0] + (br[0] - ar[0]) * t,
    ar[1] + (br[1] - ar[1]) * t,
    ar[2] + (br[2] - ar[2]) * t,
  );
}

function lighten(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount);
}

function darken(hex: string, amount: number): string {
  return mixHex(hex, '#000000', amount);
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(16, 185, 129, ${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp(alpha, 0, 1)})`;
}

/** Normalize user/MD input to #rrggbb or null when invalid. */
export function normalizeBrandHex(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return hexToRgb(withHash) ? withHash.toLowerCase() : null;
}

export function parsePortalBrandThemeOverrides(raw: unknown): PortalBrandThemeOverrides | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const accentHex = normalizeBrandHex(
    typeof row.accentHex === 'string' ? row.accentHex : undefined,
  );
  const accentHoverHex = normalizeBrandHex(
    typeof row.accentHoverHex === 'string' ? row.accentHoverHex : undefined,
  );
  const glowHex = normalizeBrandHex(typeof row.glowHex === 'string' ? row.glowHex : undefined);
  if (!accentHex && !accentHoverHex && !glowHex) return null;
  return {
    accentHex: accentHex ?? undefined,
    accentHoverHex: accentHoverHex ?? undefined,
    glowHex: glowHex ?? undefined,
  };
}

/**
 * Resolve tenant brand tokens.
 * Override path: md_settings.setting_value._portalBrandTheme { accentHex, accentHoverHex?, glowHex? }
 */
export function resolveCvsBrandTokens(
  overrides?: PortalBrandThemeOverrides | null,
): CvsBrandTokens {
  const accent = normalizeBrandHex(overrides?.accentHex) ?? DEFAULT_CVS_BRAND_TOKENS.accent;
  const accentHover =
    normalizeBrandHex(overrides?.accentHoverHex) ?? lighten(accent, 0.12);
  const glowBase = normalizeBrandHex(overrides?.glowHex) ?? accent;

  return {
    accent,
    accentHover,
    accentSoft: lighten(accent, 0.92),
    accentMuted: lighten(accent, 0.72),
    glow: rgbaFromHex(glowBase, 0.28),
    glowTeal: rgbaFromHex(mixHex(glowBase, '#2dd4bf', 0.35), 0.22),
    glowLime: rgbaFromHex(mixHex(glowBase, '#a3e635', 0.25), 0.18),
    source: overrides?.accentHex ? 'md_settings' : 'default',
  };
}

export function cvsBrandTokensToCssProperties(tokens: CvsBrandTokens): CSSProperties {
  return {
    '--cvs-accent': tokens.accent,
    '--cvs-accent-hover': tokens.accentHover,
    '--cvs-accent-soft': tokens.accentSoft,
    '--cvs-accent-muted': tokens.accentMuted,
    '--cvs-glow': tokens.glow,
    '--cvs-glow-teal': tokens.glowTeal,
    '--cvs-glow-lime': tokens.glowLime,
  } as CSSProperties;
}
