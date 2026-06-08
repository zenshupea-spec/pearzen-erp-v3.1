/** Tiled watermark — sparse grid or light repeat for login / portal shells. */

type Props = {
  logoUrl: string | null;
  /** `sparse` = few logos (default); `grid` = denser fixed grid; `portal` = SM-style tile; `repeat` = CSS tile fill. */
  mode?: 'sparse' | 'grid' | 'portal' | 'repeat';
  /** Override logo layer opacity (0–1). Defaults vary by mode. */
  opacity?: number;
  /** Weaker top/bottom fades keep watermarks visible in compact panels. */
  fadeStrength?: 'default' | 'light' | 'none';
  /** Skip the solid white underlay so parent gradients show through (compact previews). */
  base?: 'white' | 'transparent';
  /** Tighter grid + smaller logos for phone-style previews. */
  compact?: boolean;
};

const SPARSE_COLS = 4;
const SPARSE_ROWS = 5;
const GRID_COLS = 5;
const GRID_ROWS = 10;
const PORTAL_COLS = 4;
const PORTAL_ROWS = 12;

const MODE_DEFAULT_OPACITY: Record<NonNullable<Props['mode']>, number> = {
  sparse: 0.11,
  grid: 0.14,
  portal: 0.32,
  repeat: 0.07,
};

export default function BrandWatermarkBackground({
  logoUrl,
  mode = 'sparse',
  opacity,
  fadeStrength = 'default',
  base = 'white',
  compact = false,
}: Props) {
  const logoOpacity = opacity ?? MODE_DEFAULT_OPACITY[mode];
  const sparseCells = Array.from(
    { length: SPARSE_COLS * SPARSE_ROWS },
    (_, i) => i,
  );
  const gridCols = compact ? 4 : GRID_COLS;
  const gridRows = compact ? 16 : GRID_ROWS;
  const gridCells = Array.from({ length: gridCols * gridRows }, (_, i) => i);
  const portalCells = Array.from({ length: PORTAL_COLS * PORTAL_ROWS }, (_, i) => i);
  const gridLogoCls = compact
    ? 'h-5 w-5 max-h-5 max-w-5 object-contain grayscale-[0.1]'
    : 'h-7 w-7 max-h-7 max-w-7 object-contain grayscale-[0.15] sm:h-8 sm:w-8';

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {base === 'white' ? <div className="absolute inset-0 bg-white" /> : null}

      {logoUrl && mode === 'repeat' ? (
        <div
          className="absolute inset-0"
          style={{
            opacity: logoOpacity,
            backgroundImage: `url(${logoUrl})`,
            backgroundSize: '120px 120px',
            backgroundRepeat: 'repeat',
            backgroundPosition: 'center top',
          }}
        />
      ) : logoUrl && mode === 'sparse' ? (
        <div
          className="absolute inset-0 grid gap-x-10 gap-y-16 px-8 py-10 sm:gap-x-14 sm:gap-y-20 sm:px-12"
          style={{
            opacity: logoOpacity,
            gridTemplateColumns: `repeat(${SPARSE_COLS}, minmax(0, 1fr))`,
          }}
        >
          {sparseCells.map((i) => (
            <div key={i} className="flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-7 w-7 max-h-7 max-w-7 object-contain grayscale-[0.2] sm:h-8 sm:w-8"
                draggable={false}
              />
            </div>
          ))}
        </div>
      ) : logoUrl && mode === 'portal' ? (
        <div
          className="absolute inset-0 grid grid-cols-4 gap-x-1 gap-y-5 px-2 py-8 sm:px-3"
          style={{ opacity: logoOpacity }}
        >
          {portalCells.map((i) => (
            <div key={i} className="flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-9 w-9 max-h-9 max-w-9 object-contain grayscale-[0.15]"
                draggable={false}
              />
            </div>
          ))}
        </div>
      ) : logoUrl ? (
        <div
          className={`absolute inset-0 grid px-3 py-6 sm:px-4 ${
            compact ? 'gap-x-1 gap-y-5' : 'gap-x-2 gap-y-8 px-4 py-8 sm:px-6'
          }`}
          style={{
            opacity: logoOpacity,
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          }}
        >
          {gridCells.map((i) => (
            <div key={i} className="flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className={gridLogoCls}
                draggable={false}
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1.5px 1.5px, rgb(148 163 184 / 0.35) 1.5px, transparent 0)',
            backgroundSize: '36px 36px',
          }}
        />
      )}

      {fadeStrength === 'none' ? null : (
        <>
          <div
            className={`absolute inset-x-0 top-0 bg-gradient-to-b to-transparent ${
              fadeStrength === 'light'
                ? 'h-14 from-white/45'
                : mode === 'portal'
                  ? 'h-20 from-white/55'
                  : 'h-32 from-white/90'
            }`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent ${
              fadeStrength === 'light'
                ? 'h-14 from-white/40'
                : mode === 'portal'
                  ? 'h-20 from-white/50'
                  : 'h-32 from-white/85'
            }`}
          />
        </>
      )}
    </div>
  );
}
