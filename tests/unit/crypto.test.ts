import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateToken, hashToken, parseKeyRing, safeEqual, secretHint } from "@testpilot/shared/crypto";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "@testpilot/shared/password";

const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");

describe("secret encryption (AES-256-GCM)", () => {
  const ring = parseKeyRing(`a:${k1}`);

  it("round-trips a value", () => {
    const env = encryptSecret("s3cr3t-value", ring, "aad-1");
    expect(env.startsWith("v1:a:")).toBe(true);
    expect(env).not.toContain("s3cr3t");
    expect(decryptSecret(env, ring, "aad-1")).toBe("s3cr3t-value");
  });

  it("uses a random IV (same plaintext → different ciphertext)", () => {
    expect(encryptSecret("x", ring, "a")).not.toBe(encryptSecret("x", ring, "a"));
  });

  it("rejects ciphertext moved to a different owner (AAD mismatch)", () => {
    const env = encryptSecret("value", ring, "project-A");
    expect(() => decryptSecret(env, ring, "project-B")).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const env = encryptSecret("value", ring, "a").split(":");
    const ct = Buffer.from(env[4]!, "base64");
    ct[0] = ct[0]! ^ 0xff;
    env[4] = ct.toString("base64");
    expect(() => decryptSecret(env.join(":"), ring, "a")).toThrow();
  });

  it("supports key rotation: old ciphertexts decrypt, new ones use the current key", () => {
    const old = encryptSecret("legacy", parseKeyRing(`old:${k1}`), "a");
    const rotated = parseKeyRing(`new:${k2},old:${k1}`);
    expect(decryptSecret(old, rotated, "a")).toBe("legacy");
    expect(encryptSecret("fresh", rotated, "a").startsWith("v1:new:")).toBe(true);
  });

  it("validates key configuration", () => {
    expect(() => parseKeyRing("")).toThrow();
    expect(() => parseKeyRing(`a:${Buffer.alloc(16).toString("base64")}`)).toThrow(/32 bytes/);
  });
});

describe("tokens", () => {
  it("generates unique url-safe tokens", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });
  it("hashes deterministically and compares safely", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("only reveals a hint for long secrets", () => {
    expect(secretHint("short")).toBeNull();
    expect(secretHint("a-very-long-secret-1234")).toBe("…1234");
  });
});

describe("password hashing (scrypt)", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("CorrectHorse42");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("CorrectHorse42", hash)).toBe(true);
    expect(await verifyPassword("WrongHorse42", hash)).toBe(false);
  });
  it("salts hashes", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
  it("never verifies against the dummy hash or malformed input", async () => {
    expect(await verifyPassword("anything", DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });
});
