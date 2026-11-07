import { describe, expect, it } from "vitest";
import { assertSafePublicUrl, isPrivateAddress, UnsafeUrlError } from "@testpilot/shared/url-safety";

const resolve = async (host: string) =>
  ({ "public.test": ["93.184.216.34"], "private.test": ["192.168.1.5"], "mixed.test": ["8.8.8.8", "10.1.2.3"] })[host] ??
  Promise.reject(new Error("ENOTFOUND"));

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.5.4",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("assertSafePublicUrl", () => {
  it("accepts public http(s) URLs", async () => {
    await expect(assertSafePublicUrl("https://public.test/path", { resolve })).resolves.toBeInstanceOf(URL);
  });

  it.each([
    ["ftp://public.test", /http/],
    ["file:///etc/passwd", /http/],
    ["https://user:pass@public.test", /credentials/],
    ["http://localhost:3000", /Internal/],
    ["http://app.internal", /Internal/],
    ["http://127.0.0.1", /private/],
    ["http://[::1]:8080", /private/],
    ["http://169.254.169.254/latest/meta-data", /private/],
    ["https://private.test", /private/],
    ["https://mixed.test", /private/],
    ["https://unknown.test", /resolve/],
    ["not a url", /Invalid/],
  ])("rejects %s", async (url, msg) => {
    await expect(assertSafePublicUrl(url, { resolve })).rejects.toThrow(msg);
    await expect(assertSafePublicUrl(url, { resolve })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("allows private targets only when explicitly enabled (local development)", async () => {
    await expect(assertSafePublicUrl("http://localhost:5173", { allowPrivate: true })).resolves.toBeInstanceOf(URL);
  });
});
