export const SAAS_RECEIPT_BUCKET = 'saas-platform-receipts';

export function saasReceiptPublicUrl(storagePath: string | null | undefined): string | null {
  const path = storagePath?.trim();
  if (!path) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return null;

  return `${base}/storage/v1/object/public/${SAAS_RECEIPT_BUCKET}/${path}`;
}
