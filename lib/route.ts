import { NextResponse } from 'next/server';

/**
 * Wrap a route handler so an unexpected throw becomes a JSON error the page can
 * show, instead of an empty or HTML 5xx that the client cannot parse.
 */
export function safe(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[route] unhandled', e);
      return NextResponse.json({ ok: false, error: `Server error: ${message}` }, { status: 500 });
    }
  };
}
