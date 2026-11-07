/**
 * Secret redaction for logs, audit metadata and (later) agent transcripts and reports.
 */
const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key|session/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic keys
  /sk_(live|test)_[A-Za-z0-9]{10,}/g, // Stripe secret keys
  /whsec_[A-Za-z0-9]{10,}/g,
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export const REDACTED = "[REDACTED]";

export function redactString(value: string, knownSecrets: readonly string[] = []): string {
  let out = value;
  for (const s of knownSecrets) {
    if (s && s.length >= 4) out = out.split(s).join(REDACTED);
  }
  for (const re of SENSITIVE_VALUE_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

export function redact<T>(value: T, knownSecrets: readonly string[] = [], depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === "string") return redactString(value, knownSecrets) as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, knownSecrets, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, knownSecrets, depth + 1);
    }
    return out as T;
  }
  return value;
}
