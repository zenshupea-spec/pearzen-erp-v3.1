const COLOMBO_TZ = 'Asia/Colombo';

/** Format an ISO timestamp as a clock time in Asia/Colombo (matches md_settings shift labels). */
export function formatColomboTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: COLOMBO_TZ,
  });
}
