import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be exactly 32 characters long.");
  }
  console.warn("[encryption] ENCRYPTION_KEY missing or invalid — encrypt disabled in dev.");
}

export function encrypt(text) {
  if (!text) return text;
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) return text;
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

function looksEncrypted(text) {
  const parts = text.split(":");
  if (parts.length < 2) return false;
  const ivHex = parts[0];
  return ivHex.length === IV_LENGTH * 2 && /^[0-9a-f]+$/i.test(ivHex);
}

export function decrypt(text) {
  if (!text || !looksEncrypted(text)) return text;
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

