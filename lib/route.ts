import { NextResponse } from 'next/server';
import { clientIp, hasAccess, takeRateLimitSlot } from './access';

/**
 * Wrap a route handler so that
 *   - a missing passcode cookie answers 401 (when LAB_PASSCODE is set),
 *   - a visitor over their hourly limit answers 429,
 *   - an unexpected throw becomes a JSON error the page can show, instead of an
 *     empty or HTML 5xx that the client cannot parse.
 *
 * `spends: false` skips the rate limit for routes that cost nothing (the
 * passcode check itself).
 */
export function safe(handler: (req: Request) => Promise<Response>, opts: { spends?: boolean } = {}) {
  const spends = opts.spends ?? true;
  return async (req: Request): Promise<Response> => {
    try {
      if (!(await hasAccess(req))) {
        return NextResponse.json({ ok: false, error: 'This Lab needs a passcode. Open /enter.', passcode: true }, { status: 401 });
      }
      if (spends) {
        const left = await takeRateLimitSlot(clientIp(req));
        if (left < 0) {
          return NextResponse.json(
            { ok: false, error: 'You have made many requests this hour. Please try again later.', rateLimited: true },
            { status: 429, headers: { 'Retry-After': '900' } },
          );
        }
      }
      return await handler(req);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[route] unhandled', e);
      return NextResponse.json({ ok: false, error: `Server error: ${message}` }, { status: 500 });
    }
  };
}
