/** Grama Niladari expiry is required whenever a scan is on file. */

export function gramaNiladariExpiryError(args: {
  gramaNiladariUrl?: string | null;
  gramaNiladariExpiry?: string | null;
}): string | null {
  const hasDoc = Boolean(String(args.gramaNiladariUrl ?? '').trim());
  if (!hasDoc) return null;
  const expiry = String(args.gramaNiladariExpiry ?? '').trim();
  if (!expiry) {
    return 'Grama Niladari expiry date is required when a certificate scan is on file.';
  }
  return null;
}
