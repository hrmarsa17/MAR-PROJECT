import { NextRequest, NextResponse } from 'next/server';

const PUBLIK = ['/masuk', '/api/masuk'];
const PKMB_ROUTES = [
  '/monitoring', '/approval', '/wo', '/admin', '/antrean', '/performa',
  '/reports', '/teknis', '/koreksi', '/penerapan', '/lapangan',
];

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (PUBLIK.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get('mar_token')?.value;
  const sistem = req.cookies.get('mar_sistem')?.value || 'PKMB';

  if (!token) {
    return NextResponse.redirect(new URL('/masuk', req.url));
  }

  if (sistem === 'KMB' || sistem === 'SUM') {
    if (!PKMB_ROUTES.some(r => pathname.startsWith(r))) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/masuk', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
