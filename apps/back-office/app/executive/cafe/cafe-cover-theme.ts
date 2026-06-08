export type CafeCoverTheme = {
  primary: string;
  primaryDark: string;
  accent: string;
  accentDark: string;
  primarySoft: string;
  accentSoft: string;
};

export type CategoryPalette = {
  gradFrom: string;
  gradTo: string;
};

export const DEFAULT_CAFE_COVER_THEME: CafeCoverTheme = {
  primary: '#c45c8a',
  primaryDark: '#8f3d62',
  accent: '#5a9e7a',
  accentDark: '#3d7358',
  primarySoft: '#f9edf3',
  accentSoft: '#edf5f0',
};

/** Default colour for header/footer text on the menu cover band. */
export const DEFAULT_CAFE_COVER_TEXT_COLOR = '#ffffff';

export const COVER_TEXT_SHADOW =
  '0 2px 10px rgba(0,0,0,0.72), 0 0 3px rgba(0,0,0,0.55), 0 1px 0 rgba(0,0,0,0.35)';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(a: string, b: string, ratio: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const t = clamp(ratio, 0, 1);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - clamp(amount, 0, 1);
  return rgbToHex(r * f, g * f, b * f);
}

function soften(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }

  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = clamp(s, 0, 1);
  const lit = clamp(l, 0, 1);

  if (sat === 0) {
    const v = lit * 255;
    return [v, v, v];
  }

  const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
  const p = 2 * lit - q;

  const hueToRgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };

  return [
    hueToRgb(hue + 1 / 3) * 255,
    hueToRgb(hue) * 255,
    hueToRgb(hue - 1 / 3) * 255,
  ];
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function buildThemeFromHues(primaryHue: number, accentHue: number, primarySat: number, accentSat: number): CafeCoverTheme {
  const primary = hslToHex(primaryHue, clamp(primarySat, 0.38, 0.72), 0.46);
  const accent = hslToHex(accentHue, clamp(accentSat, 0.34, 0.68), 0.42);

  return {
    primary,
    primaryDark: darken(primary, 0.28),
    accent,
    accentDark: darken(accent, 0.24),
    primarySoft: soften(primary, 0.9),
    accentSoft: soften(accent, 0.88),
  };
}

/** Derive category card gradients from the cover theme so menu sections feel cohesive. */
export function deriveCategoryPalette(theme: CafeCoverTheme, index: number): CategoryPalette {
  const [primaryHue] = hexToHsl(theme.primary);
  const [accentHue] = hexToHsl(theme.accent);
  const shifts = [0, 22, -22, 44, -44, 66];
  const shift = shifts[index % shifts.length];
  const useAccent = index % 2 === 1;
  const baseHue = (useAccent ? accentHue : primaryHue) + shift;
  const gradFrom = hslToHex(baseHue, 0.42, 0.72);
  const gradTo = hslToHex(baseHue + (useAccent ? -8 : 8), 0.55, 0.34);
  return { gradFrom, gradTo };
}

/** Sample a cover image and derive UI colours that match the photo. */
export async function extractCoverTheme(coverUrl: string): Promise<CafeCoverTheme> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!coverUrl.startsWith('data:') && !coverUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(DEFAULT_CAFE_COVER_THEME);
          return;
        }

        const size = 72;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>();
        const bucketSize = 18;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 48) continue;

          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const [, s, l] = rgbToHsl(r, g, b);

          if (s < 0.1 || l < 0.12 || l > 0.9) continue;

          const weight = s * (1 - Math.abs(l - 0.42) * 1.1);
          if (weight < 0.04) continue;

          const hue = rgbToHsl(r, g, b)[0];
          const bucket = Math.floor(hue / bucketSize) * bucketSize;
          const prev = buckets.get(bucket) ?? { weight: 0, r: 0, g: 0, b: 0 };
          buckets.set(bucket, {
            weight: prev.weight + weight,
            r: prev.r + r * weight,
            g: prev.g + g * weight,
            b: prev.b + b * weight,
          });
        }

        const ranked = [...buckets.entries()]
          .map(([bucket, v]) => ({
            bucket,
            weight: v.weight,
            hex: rgbToHex(v.r / v.weight, v.g / v.weight, v.b / v.weight),
          }))
          .sort((a, b) => b.weight - a.weight);

        if (!ranked.length) {
          resolve(DEFAULT_CAFE_COVER_THEME);
          return;
        }

        const primaryHex = ranked[0].hex;
        const [primaryHue, primarySat] = hexToHsl(primaryHex);

        let accentHue = (primaryHue + 150) % 360;
        let accentSat = clamp(primarySat * 0.92, 0.34, 0.68);

        for (let i = 1; i < ranked.length; i += 1) {
          const [hue, sat] = hexToHsl(ranked[i].hex);
          if (hueDistance(primaryHue, hue) >= 35) {
            accentHue = hue;
            accentSat = sat;
            break;
          }
        }

        resolve(buildThemeFromHues(primaryHue, accentHue, primarySat, accentSat));
      } catch {
        resolve(DEFAULT_CAFE_COVER_THEME);
      }
    };
    img.onerror = () => resolve(DEFAULT_CAFE_COVER_THEME);
    img.src = coverUrl;
  });
}
