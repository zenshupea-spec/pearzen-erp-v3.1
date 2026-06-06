/** Tiled watermark — sparse grid or light repeat for login / portal shells. */

type Props = {
  logoUrl: string | null;
  /** `sparse` = few logos (default); `grid` = denser fixed grid; `repeat` = CSS tile fill. */
  mode?: 'sparse' | 'grid' | 'repeat';
};

const SPARSE_COLS = 4;
const SPARSE_ROWS = 5;
const GRID_COLS = 5;
const GRID_ROWS = 10;

export default function BrandWatermarkBackground({
  logoUrl,
  mode = 'sparse',
}: Props) {
  const sparseCells = Array.from(
    { length: SPARSE_COLS * SPARSE_ROWS },
    (_, i) => i,
  );
  const gridCells = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => i);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-white" />

      {logoUrl && mode === 'repeat' ? (
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url(${logoUrl})`,
            backgroundSize: '120px 120px',
            backgroundRepeat: 'repeat',
            backgroundPosition: 'center top',
          }}
        />
      ) : logoUrl && mode === 'sparse' ? (
        <div
          className="absolute inset-0 grid gap-x-10 gap-y-16 px-8 py-10 opacity-[0.11] sm:gap-x-14 sm:gap-y-20 sm:px-12"
          style={{
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
      ) : logoUrl ? (
        <div
          className="absolute inset-0 grid gap-x-2 gap-y-8 px-4 py-8 opacity-[0.14] sm:px-6"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
          }}
        >
          {gridCells.map((i) => (
            <div key={i} className="flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-7 w-7 max-h-7 max-w-7 object-contain grayscale-[0.15] sm:h-8 sm:w-8"
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

      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white/85 to-transparent" />
    </div>
  );
}
