/**
 * Secret encryption (AES-256-GCM) and token helpers. Server-only.
 *
 * Envelope format: v1:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>
 * The key id allows key rotation: decrypt looks up the key by id; encrypt always uses the
 * current key. Associated data (AAD) binds a ciphertext to its owner (e.g. project id + key)
 * so an encrypted value cannot be copied to another row and decrypted there.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface KeyRing {
  currentKeyId: string;
  keys: Record<string, Buffer>;
}

/**
 * Parse ENCRYPTION_KEYS ("id1:base64key,id2:base64key"; first entry is current) or a single
 * ENCRYPTION_KEY (base64, 32 bytes) into a key ring.
 */
export function parseKeyRing(spec: string): KeyRing {
  const entries = spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const idx = entry.indexOf(":");
      const [id, b64] = idx === -1 ? [`k${i}`, entry] : [entry.slice(0, idx), entry.slice(idx + 1)];
      const key = Buffer.from(b64, "base64");
      if (key.length !== 32) throw new Error(`Encryption key "${id}" must be 32 bytes (base64-encoded)`);
      if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) throw new Error(`Invalid encryption key id "${id}"`);
      return [id, key] as const;
    });
  if (entries.length === 0) throw new Error("No encryption keys configured");
  return { currentKeyId: entries[0]![0], keys: Object.fromEntries(entries) };
}

export function encryptSecret(plaintext: string, ring: KeyRing, aad: string): string {
  const key = ring.keys[ring.currentKeyId]!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", ring.currentKeyId, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(envelope: string, ring: KeyRing, aad: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 5 || parts[0] !== "v1") throw new Error("Unsupported secret envelope");
  const [, keyId, ivB64, tagB64, ctB64] = parts as [string, string, string, string, string];
  const key = ring.keys[keyId];
  if (!key) throw new Error(`Unknown encryption key id "${keyId}"`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** URL-safe random token suitable for cookies, email links and invitations. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored hashed so a database leak does not yield usable sessions or links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Display hint for a secret: last 4 characters only when the value is long enough (≥ 12). */
export function secretHint(value: string): string | null {
  return value.length >= 12 ? `…${value.slice(-4)}` : null;
}
