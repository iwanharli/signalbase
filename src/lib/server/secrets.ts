// Encrypts third-party credentials (AI provider API keys) at rest with AES-256-GCM.
// The key is derived from AUTH_SECRET, so no extra environment variable is needed;
// rotating AUTH_SECRET means re-entering the provider keys.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const VERSION = "v1";

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET belum diatur");
  return Buffer.from(hkdfSync("sha256", secret, "signalbase", "ai-provider-keys", 32));
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

export function decryptSecret(sealed: string) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Format kredensial tidak dikenal");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Last four characters, for showing which key is stored without revealing it. */
export const secretHint = (plain: string) => plain.slice(-4);
