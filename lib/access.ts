/**
 * Who may spend credits: a shared passcode and a per-visitor rate limit.
 *
 * PASSCODE. When LAB_PASSCODE is set, the site asks for it once and keeps a
 * cookie holding its SHA-256 hash; every /api/lab route checks the cookie. The
 * passcode is for a hackathon demo: one secret shared with judges and friends,
 * not accounts. Unset means the site is open, which is right for local work.
 *
 * RATE LIMIT. Each visitor (by IP) gets LAB_RATE_LIMIT_PER_HOUR API calls per
 * hour (default 40; one build is about 5 calls). Counted in the same store as
 * the credit budget, so with Redis it holds across serverless instances.
 *
 * Both run in the Node runtime (routes), not the Edge middleware, so they can
 * share lib/budget's store. The middleware only redirects pages to /enter.
 */

import { getStore } from './budget';

const COOKIE = 'lab_pass';
const HOUR_TTL = 60 * 60 * 2;

export const passcodeRequired = () => !!process.env.LAB_PASSCODE;

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The cookie a correct passcode earns; null when none is configured. */
export async function passcodeCookieValue(): Promise<string | null> {
  const p = process.env.LAB_PASSCODE;
  return p ? sha256(p) : null;
}

export const passcodeCookieName = COOKIE;

function cookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** True when no passcode is configured or the request carries the right cookie. */
export async function hasAccess(req: Request): Promise<boolean> {
  const want = await passcodeCookieValue();
  if (!want) return true;
  const got = cookie(req, COOKIE);
  return !!got && timingSafeEqual(got, want);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') ?? 'local').trim();
}

export const rateLimitPerHour = () => {
  const n = Number(process.env.LAB_RATE_LIMIT_PER_HOUR ?? 40);
  return Number.isFinite(n) && n > 0 ? n : 40;
};

/** Count this call; return how many remain, or -1 when the visitor is over the limit. */
export async function takeRateLimitSlot(ip: string, now = new Date()): Promise<number> {
  const hour = now.toISOString().slice(0, 13);
  const key = `lab:rl:${ip}:${hour}`;
  const store = getStore();
  try {
    await store.add(key, { calls: 1 }, HOUR_TTL);
    const used = (await store.read(key)).calls ?? 1;
    return used > rateLimitPerHour() ? -1 : rateLimitPerHour() - used;
  } catch (e) {
    console.warn('[access] rate-limit store failed; allowing the request', e);
    return rateLimitPerHour();
  }
}
