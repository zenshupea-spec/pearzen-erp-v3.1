export type IcalCancellationRow = {
  uid: string;
  checkIn: string;
  checkOut: string;
  cancelledAt: string;
};

const CANCELLATION_TTL_MS = 14 * 86_400_000;

export function pearzenIcalUid(bookingId: string): string {
  return `${bookingId}@pearzen-shalom`;
}

export function readIcalCancellations(settings: Record<string, unknown> | undefined): IcalCancellationRow[] {
  if (!settings || !Array.isArray(settings.icalCancellations)) return [];

  const cutoff = Date.now() - CANCELLATION_TTL_MS;
  return (settings.icalCancellations as IcalCancellationRow[]).filter((row) => {
    const cancelledAt = Date.parse(String(row.cancelledAt ?? ''));
    return Number.isFinite(cancelledAt) && cancelledAt >= cutoff;
  });
}

export function appendIcalCancellation(
  settings: Record<string, unknown> | undefined,
  cancel: Omit<IcalCancellationRow, 'cancelledAt'>,
): Record<string, unknown> {
  const base = settings && typeof settings === 'object' ? { ...settings } : {};
  const existing = readIcalCancellations(base).filter((row) => row.uid !== cancel.uid);
  const icalCancellations: IcalCancellationRow[] = [
    ...existing,
    { ...cancel, cancelledAt: new Date().toISOString() },
  ];
  return { ...base, icalCancellations };
}
