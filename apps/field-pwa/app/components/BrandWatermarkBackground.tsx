/** Tiled watermark using the company logo from MD portal settings. */

const COLS = 4;
const ROWS = 14;

export default function BrandWatermarkBackground({ logoUrl }: { logoUrl: string | null }) {
  const cells = Array.from({ length: COLS * ROWS }, (_, i) => i);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-white" />

      {logoUrl ? (
        <div className="absolute inset-0 grid grid-cols-4 gap-x-1 gap-y-5 px-2 py-8 opacity-[0.32] sm:px-3">
          {cells.map((i) => (
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
      ) : (
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1.5px 1.5px, rgb(148 163 184 / 0.45) 1.5px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      )}

      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/80 to-transparent" />
    </div>
  );
}
