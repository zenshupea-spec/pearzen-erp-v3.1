/** Edge-safe HMAC cookie signing (Web Crypto — no Node.js `crypto` module). */

function pinCookieSecret(): string {
  const dedicated = process.env.PORTAL_PIN_COOKIE_SECRET?.trim();
  if (dedicated) return dedicated;

  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    throw new Error(
      "PORTAL_PIN_COOKIE_SECRET is required in production deployments.",
    );
  }

  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-portal-pin-secret";
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const base64 = normalized + (pad ? "=".repeat(4 - pad) : "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function signPortalCookiePayload(payload: string): Promise<string> {
  return hmacSha256Hex(pinCookieSecret(), payload);
}

export async function encodeSignedPortalCookie(payload: string): Promise<string> {
  return `${base64UrlEncode(payload)}.${await signPortalCookiePayload(payload)}`;
}

export async function decodeSignedPortalCookie(
  token: string,
): Promise<{ payload: string; valid: boolean }> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return { payload: "", valid: false };

  try {
    const payload = base64UrlDecode(body);
    const expected = await signPortalCookiePayload(payload);
    const valid = timingSafeEqualHex(sig, expected);
    return { payload, valid };
  } catch {
    return { payload: "", valid: false };
  }
}
