import { createDecipheriv } from 'node:crypto';

import { createSupabaseServiceClient } from '../supabase/service';

export type ResolvedPayHereCredentials = {
  merchantId: string;
  merchantSecret: string;
  sandbox: boolean;
  source: 'tenant' | 'env';
};

const IV_LENGTH = 16;

function encryptionKey(): string | null {
  const key = process.env.ENCRYPTION_KEY?.trim();
  if (!key || key.length !== 32) return null;
  return key;
}

function looksEncrypted(text: string): boolean {
  const parts = text.split(':');
  if (parts.length < 2) return false;
  const ivHex = parts[0];
  return ivHex.length === IV_LENGTH * 2 && /^[0-9a-f]+$/i.test(ivHex);
}

function decryptPayHereSecret(text: string): string | null {
  if (!text?.trim()) return null;
  if (!looksEncrypted(text)) return text.trim();

  const key = encryptionKey();
  if (!key) return null;

  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch {
    return null;
  }
}

export async function resolvePayHereCredentialsForCompany(
  companyId: string,
): Promise<ResolvedPayHereCredentials | null> {
  const scopedCompanyId = companyId?.trim();
  if (!scopedCompanyId) return null;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    try {
      const supabase = createSupabaseServiceClient();
      const { data, error } = await supabase
        .from('tenant_payhere_credentials')
        .select('merchant_id, merchant_secret_encrypted, sandbox')
        .eq('company_id', scopedCompanyId)
        .maybeSingle();

      if (!error && data?.merchant_id && data?.merchant_secret_encrypted) {
        const merchantSecret = decryptPayHereSecret(String(data.merchant_secret_encrypted));
        if (merchantSecret) {
          return {
            merchantId: String(data.merchant_id),
            merchantSecret,
            sandbox: data.sandbox !== false,
            source: 'tenant',
          };
        }
      }
    } catch (error: unknown) {
      console.error(
        'resolvePayHereCredentialsForCompany:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const menuCompanyId = process.env.NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID?.trim();
  const envMerchantId = process.env.PAYHERE_MERCHANT_ID?.trim();
  const envSecret = process.env.PAYHERE_MERCHANT_SECRET?.trim();

  if (
    menuCompanyId &&
    scopedCompanyId === menuCompanyId &&
    envMerchantId &&
    envSecret
  ) {
    return {
      merchantId: envMerchantId,
      merchantSecret: envSecret,
      sandbox: process.env.PAYHERE_SANDBOX !== 'false',
      source: 'env',
    };
  }

  return null;
}

export async function fetchPayHerePaymentStatus(companyId: string) {
  const creds = await resolvePayHereCredentialsForCompany(companyId);
  return {
    configured: Boolean(creds),
    sandbox: creds?.sandbox ?? true,
    source: creds?.source ?? null,
  };
}

export function menuCompanyIdFromEnv(): string | null {
  const value = process.env.NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID?.trim();
  return value || null;
}

export function assertOrderCompanyAllowed(orderCompanyId: string): boolean {
  const scopedMenuCompanyId = menuCompanyIdFromEnv();
  if (!scopedMenuCompanyId) return true;
  return orderCompanyId === scopedMenuCompanyId;
}
