import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateHeadOfficeTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function buildHeadOfficeTotpUri(
  secret: string,
  email: string,
  issuer = 'Pearzen ERP',
): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function generateHeadOfficeTotpCode(
  secretBase32: string,
  timestampMs = Date.now(),
): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  return hotp(secret, counter);
}

export function verifyHeadOfficeTotpCode(
  secretBase32: string,
  code: string,
  window = 1,
): boolean {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;

  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const ts = now + offset * TOTP_STEP_SECONDS * 1000;
    const expected = generateHeadOfficeTotpCode(secretBase32, ts);
    try {
      if (
        timingSafeEqual(Buffer.from(expected), Buffer.from(trimmed.padStart(6, '0')))
      ) {
        return true;
      }
    } catch {
      if (expected === trimmed) return true;
    }
  }

  return false;
}

function totpCryptoSecret(): string {
  return (
    process.env.PORTAL_TOTP_ENCRYPTION_SECRET ??
    process.env.PORTAL_PIN_COOKIE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'dev-portal-totp-secret'
  );
}

export function encryptHeadOfficeTotpSecret(secret: string): string {
  const key = createHmac('sha256', totpCryptoSecret()).update('totp-v1').digest();
  const iv = randomBytes(12);
  const cipherBytes = createHmac('sha256', key)
    .update(`${iv.toString('hex')}:${secret}`)
    .digest('hex');
  return `${iv.toString('hex')}:${cipherBytes}:${Buffer.from(secret).toString('base64url')}`;
}

export function decryptHeadOfficeTotpSecret(stored: string): string | null {
  const parts = stored.split(':');
  if (parts.length !== 3) return null;
  try {
    return Buffer.from(parts[2], 'base64url').toString('utf8');
  } catch {
    return null;
  }
}
