/**
 * SSRF protection for user-supplied application URLs.
 *
 * Customer apps are only ever *fetched* from the isolated browser worker, whose egress is
 * also restricted at the network layer (see docs/architecture/security-model.md). This check
 * is defence in depth: it rejects URLs that resolve to loopback, private, link-local
 * (cloud metadata, 169.254.169.254), CGNAT, multicast or otherwise reserved addresses.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  return (
    /^f[cd][0-9a-f]{2}:/.test(lower) || // unique local fc00::/7
    /^fe[89ab][0-9a-f]:/.test(lower) || // link-local fe80::/10
    /^ff[0-9a-f]{2}:/.test(lower) || // multicast
    lower.startsWith("2001:db8:") || // documentation
    lower.startsWith("64:ff9b:") // NAT64
  );
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

const BLOCKED_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /^metadata\.google\.internal$/i];

export interface UrlSafetyOptions {
  /** Allow private/loopback targets (local development only). */
  allowPrivate?: boolean;
  /** Custom resolver for tests. */
  resolve?: (hostname: string) => Promise<string[]>;
}

/** Throws UnsafeUrlError when the URL is not a safe public http(s) target. */
export async function assertSafePublicUrl(raw: string, opts: UrlSafetyOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("URLs must not contain credentials");
  if (opts.allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.some((re) => re.test(host))) throw new UnsafeUrlError("Internal hostnames are not allowed");

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    const resolve =
      opts.resolve ?? (async (h: string) => (await lookup(h, { all: true, verbatim: true })).map((a) => a.address));
    try {
      addresses = await resolve(host);
    } catch {
      throw new UnsafeUrlError(`Could not resolve host "${host}"`);
    }
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`Could not resolve host "${host}"`);
  if (addresses.some(isPrivateAddress)) throw new UnsafeUrlError("URL resolves to a private or reserved address");
  return url;
}
