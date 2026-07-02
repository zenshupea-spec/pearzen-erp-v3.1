import { SHALOM_PUBLIC_URL } from './shalom-public-host';

/** Guest-facing site origin for return/cancel URLs and listing previews. */
export function resolveShalomPublicSiteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SHALOM_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (process.env.NODE_ENV === 'development') {
    const devHost = process.env.NEXT_PUBLIC_SHALOM_PUBLIC_HOST?.trim();
    if (devHost) {
      const bare = devHost.replace(/^https?:\/\//, '').split('/')[0];
      return `http://${bare}:3002`;
    }
    return 'http://127.0.0.1:3002/shalom-public';
  }

  return SHALOM_PUBLIC_URL;
}

/** Back-office origin for PayHere server notify (must be publicly reachable in production). */
export function resolveShalomPayHereNotifyBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SHALOM_PAYHERE_NOTIFY_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACK_OFFICE_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (configured) {
    const withProtocol = configured.startsWith('http') ? configured : `https://${configured}`;
    return withProtocol.replace(/\/$/, '');
  }

  return 'http://127.0.0.1:3002';
}
