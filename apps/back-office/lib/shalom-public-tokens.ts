/** Design tokens for shalom.pearzen.tech — warm stone + teal hospitality palette. */

export const SHALOM_PUBLIC_COLORS = {
  bg: '#f5f0ea',
  surface: '#fffdf9',
  text: '#1c1917',
  muted: '#78716c',
  accent: '#0d9488',
  accentHover: '#0f766e',
  accentSoft: '#ccfbf1',
  border: '#e7e5e4',
  cardShadow: '0 18px 45px -28px rgba(28, 25, 23, 0.35)',
} as const;

export const shalomPublicCssVars = `
  --shalom-bg: ${SHALOM_PUBLIC_COLORS.bg};
  --shalom-surface: ${SHALOM_PUBLIC_COLORS.surface};
  --shalom-text: ${SHALOM_PUBLIC_COLORS.text};
  --shalom-muted: ${SHALOM_PUBLIC_COLORS.muted};
  --shalom-accent: ${SHALOM_PUBLIC_COLORS.accent};
  --shalom-accent-hover: ${SHALOM_PUBLIC_COLORS.accentHover};
  --shalom-accent-soft: ${SHALOM_PUBLIC_COLORS.accentSoft};
  --shalom-border: ${SHALOM_PUBLIC_COLORS.border};
  --shalom-shadow: ${SHALOM_PUBLIC_COLORS.cardShadow};
`;

export const shalomPublicSurfaceClass =
  'rounded-2xl border border-[color:var(--shalom-border)] bg-[color:var(--shalom-surface)] shadow-[var(--shalom-shadow)]';

export const shalomPublicButtonPrimaryClass =
  'inline-flex items-center justify-center rounded-xl bg-[color:var(--shalom-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[color:var(--shalom-accent-hover)]';

export const shalomPublicButtonGhostClass =
  'inline-flex items-center justify-center rounded-xl border border-[color:var(--shalom-border)] bg-white/80 px-5 py-2.5 text-sm font-semibold text-[color:var(--shalom-text)] transition hover:border-[color:var(--shalom-accent)] hover:text-[color:var(--shalom-accent)]';

export const shalomPublicDisplayClass = 'font-[family-name:var(--font-shalom-display)]';

export const shalomPublicBodyClass = 'font-[family-name:var(--font-shalom-body)]';
