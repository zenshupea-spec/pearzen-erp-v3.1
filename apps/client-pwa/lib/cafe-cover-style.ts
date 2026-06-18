export const DEFAULT_CAFE_COVER_TINT_STRENGTH = 100;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function buildCoverOverlayGradient(strength = DEFAULT_CAFE_COVER_TINT_STRENGTH): string {
  const t = clamp(strength, 0, 100) / 100;
  const top = (0.35 * t).toFixed(3);
  const bottom = (0.55 * t).toFixed(3);
  return `linear-gradient(180deg, rgba(15,23,42,${top}), rgba(15,23,42,${bottom}))`;
}

export function coverHeaderBackgroundStyle(
  coverUrl: string,
  tintStrength = DEFAULT_CAFE_COVER_TINT_STRENGTH,
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  return {
    backgroundImage: `${buildCoverOverlayGradient(tintStrength)}, url(${coverUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}
