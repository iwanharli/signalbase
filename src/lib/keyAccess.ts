// Where a project's API key may be used from: IP addresses (server calls) and website domains (browser calls).
// Shared by the panel form (validation) and the public API gate (matching). No rules = usable from anywhere.

export const MAX_ACCESS_RULES = 20;

// ── IP addresses ────────────────────────────────────────────────────────────────

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

const ipv4ToInt = (ip: string) => ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;

/** "203.0.113.7", "203.0.113.0/24" or an IPv6 address; null when invalid. Returned in canonical form. */
export function normalizeIpRule(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  const [ip, bits, ...extra] = value.split("/");
  if (extra.length) return null;
  if (IPV4.test(ip)) {
    if (bits === undefined) return ip;
    const n = Number(bits);
    return /^\d{1,2}$/.test(bits) && n >= 8 && n <= 32 ? `${ip}/${n}` : null;
  }
  if (bits === undefined && ip.includes(":") && IPV6.test(ip) && ip.length <= 39) return ip;
  return null;
}

export function ipAllowed(ip: string | null, rules: string[]) {
  if (!ip) return false;
  const addr = ip.trim().toLowerCase().replace(/^::ffff:/, "");
  return rules.some((rule) => {
    const [base, bits] = rule.split("/");
    if (bits === undefined) return base === addr;
    if (!IPV4.test(addr)) return false;
    const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (ipv4ToInt(addr) & mask) === (ipv4ToInt(base) & mask);
  });
}

// ── Website domains ─────────────────────────────────────────────────────────────

const HOST = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(:\d{1,5})?$/;

/** "kipermas.id", "*.kipermas.id", "localhost:3000", or a full URL ("https://app.kipermas.id/x" → "app.kipermas.id"). */
export function normalizeOriginRule(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (/^https?:\/\//.test(value)) {
    try { value = new URL(value).host; } catch { return null; }
  }
  value = value.replace(/\/+$/, "");
  return HOST.test(value) ? value : null;
}

/** Host of the calling page, from the Origin header (or Referer, which some browsers send instead). */
export function requestHost(origin: string | null, referer: string | null) {
  for (const value of [origin, referer]) {
    if (!value || value === "null") continue;
    try { return new URL(value).host.toLowerCase(); } catch { /* try the next one */ }
  }
  return null;
}

export function originAllowed(host: string | null, rules: string[]) {
  if (!host) return false;
  return rules.some((rule) => (rule.startsWith("*.") ? host.endsWith(rule.slice(1)) && host !== rule.slice(2) : host === rule));
}

/** Cleans a submitted list: trimmed, canonical, de-duplicated. Returns the first invalid entry when there is one. */
export function cleanRules(values: string[], normalize: (raw: string) => string | null): { rules: string[]; invalid: string | null } {
  const rules: string[] = [];
  for (const raw of values) {
    if (!raw.trim()) continue;
    const rule = normalize(raw);
    if (!rule) return { rules, invalid: raw.trim() };
    if (!rules.includes(rule)) rules.push(rule);
  }
  return { rules, invalid: null };
}
