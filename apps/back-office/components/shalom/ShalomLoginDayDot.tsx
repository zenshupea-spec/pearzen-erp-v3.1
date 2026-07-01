import type { ShalomLoginDotStatus } from '../../lib/shalom-calendar';
import { shalomLoginDotTitle } from '../../lib/shalom-calendar';

export function ShalomLoginDayDot({
  status,
  title,
}: {
  status: ShalomLoginDotStatus;
  title?: string;
}) {
  if (!status) return null;

  return (
    <span
      title={title ?? shalomLoginDotTitle(status)}
      aria-hidden
      className={[
        'absolute top-1 right-1 h-1.5 w-1.5 rounded-full ring-1 ring-white/80',
        status === 'green' ? 'bg-emerald-500' : 'bg-rose-500',
      ].join(' ')}
    />
  );
}
