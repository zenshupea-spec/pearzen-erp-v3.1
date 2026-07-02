import crypto from "crypto";

const IV_LENGTH = 16;

function encryptionKey() {
  return process.env.ENCRYPTION_KEY?.trim();
}

export function isEncryptionKeyConfigured() {
  const key = encryptionKey();
  return Boolean(key && key.length === 32);
}

export function assertEncryptionKeyConfigured() {
  if (!isEncryptionKeyConfigured()) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 characters long.");
  }
}

function assertEncryptionKey() {
  const key = encryptionKey();
  if (key && key.length === 32) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be exactly 32 characters long.");
  }
  console.warn("[encryption] ENCRYPTION_KEY missing or invalid — encrypt disabled in dev.");
  return null;
}

export function looksEncrypted(text) {
  if (!text || typeof text !== "string") return false;
  const parts = text.split(":");
  if (parts.length < 2) return false;
  const ivHex = parts[0];
  return ivHex.length === IV_LENGTH * 2 && /^[0-9a-f]+$/i.test(ivHex);
}

export function encrypt(text) {
  if (!text) return text;
  const ENCRYPTION_KEY = assertEncryptionKey();
  if (!ENCRYPTION_KEY) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text) {
  if (!text || !looksEncrypted(text)) return text;
  const ENCRYPTION_KEY = encryptionKey();
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) return text;
  try {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY),
      iv
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch {
    return text;
  }
}
