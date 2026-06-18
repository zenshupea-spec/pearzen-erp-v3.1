import type { SecurityWebsiteImageSlot } from './security-website-images';

export type SecurityWebsiteImageFrame = {
  objectPosition: string;
  scale: number;
};

export type SecurityWebsiteImageFrames = Partial<
  Record<SecurityWebsiteImageSlot, SecurityWebsiteImageFrame>
>;

const SLOT_SET = new Set<string>([
  'logo',
  'hero',
  'about',
  'tech',
  'timelineCoverage',
  'timelineMonitoring',
]);

export function parseObjectPosition(position: string): { x: number; y: number } {
  const parts = position.trim().split(/\s+/);
  const read = (part: string | undefined, fallback: number) => {
    if (!part || part === 'center') return fallback;
    if (part.endsWith('%')) {
      const value = Number.parseFloat(part);
      return Number.isFinite(value) ? value : fallback;
    }
    return fallback;
  };
  return { x: read(parts[0], 50), y: read(parts[1] ?? parts[0], 50) };
}

export function formatObjectPosition(x: number, y: number): string {
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
  return `${clamp(x)}% ${clamp(y)}%`;
}

export function normalizeImageFrame(
  value: unknown,
  fallback: SecurityWebsiteImageFrame,
): SecurityWebsiteImageFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const row = value as Record<string, unknown>;
  const objectPosition =
    typeof row.objectPosition === 'string' && row.objectPosition.trim()
      ? row.objectPosition.trim()
      : fallback.objectPosition;
  const scaleRaw = typeof row.scale === 'number' ? row.scale : Number.parseFloat(String(row.scale ?? ''));
  const scale = Number.isFinite(scaleRaw)
    ? Math.min(3, Math.max(1, scaleRaw))
    : fallback.scale;
  return { objectPosition, scale };
}

export function mergeImageFrames(raw: unknown): SecurityWebsiteImageFrames {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const frames: SecurityWebsiteImageFrames = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SLOT_SET.has(key)) continue;
    frames[key as SecurityWebsiteImageSlot] = normalizeImageFrame(value, {
      objectPosition: 'center',
      scale: 1,
    });
  }
  return frames;
}

export function resolveImageFrame(
  frames: SecurityWebsiteImageFrames | undefined,
  slot: SecurityWebsiteImageSlot,
  fallback: SecurityWebsiteImageFrame,
): SecurityWebsiteImageFrame {
  return normalizeImageFrame(frames?.[slot], fallback);
}
