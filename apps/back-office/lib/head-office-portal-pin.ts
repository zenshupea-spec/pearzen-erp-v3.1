import { pbkdf2Sync, timingSafeEqual } from "crypto";

const PIN_ITERATIONS = 100_000;

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hashPortalPin(pin: string): string {
  const salt = randomHex(16);
  const hash = pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, "sha256").toString(
    "hex",
  );
  return `${salt}:${hash}`;
}

export function verifyPortalPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, "sha256").toString(
    "hex",
  );
  try {
    return timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(derived, "hex"),
    );
  } catch {
    return false;
  }
}
