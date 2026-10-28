import { NextResponse } from 'next/server';
import { z } from 'zod';
import { passcodeCookieName, passcodeCookieValue, passcodeRequired, sha256 } from '@/lib/access';
import { clientIp, takeRateLimitSlot } from '@/lib/access';

const Body = z.object({ passcode: z.string().min(1).max(200) });

/** Check the passcode; set the access cookie for 30 days. Rate-limited so it cannot be guessed quickly. */
export async function POST(req: Request) {
  if (!passcodeRequired()) return NextResponse.json({ ok: true, open: true });
  if ((await takeRateLimitSlot(`enter:${clientIp(req)}`)) < 0) {
    return NextResponse.json({ ok: false, error: 'Too many attempts. Try again in a while.' }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Enter the passcode.' }, { status: 400 });

  const want = await passcodeCookieValue();
  const got = await sha256(parsed.data.passcode.trim());
  if (!want || got !== want) return NextResponse.json({ ok: false, error: 'That passcode is not right.' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(passcodeCookieName, want, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
