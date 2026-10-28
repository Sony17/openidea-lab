import { NextResponse, type NextRequest } from 'next/server';

/**
 * Send pages to /enter until the passcode cookie is present. Only when
 * LAB_PASSCODE is set. The cookie's expected value is the passcode's SHA-256,
 * computed here with Web Crypto because middleware runs on the Edge runtime.
 * API routes do their own check in lib/route.ts, so this is the pages half.
 */

const OPEN_PATHS = ['/enter', '/api/lab/enter', '/usage'];

let cached: string | null = null;
async function expected(): Promise<string> {
  if (cached) return cached;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(process.env.LAB_PASSCODE ?? ''));
  cached = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return cached;
}

export async function middleware(req: NextRequest) {
  if (!process.env.LAB_PASSCODE) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.next(); // routes answer 401 JSON themselves

  if (req.cookies.get('lab_pass')?.value === (await expected())) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/enter';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico|css|js|map)$).*)'],
};
