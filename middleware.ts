import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'plex_sable_auth';

function isApiRequest(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith('/api/');
}

function denyUnauthenticatedRequest(request: NextRequest): NextResponse {
  if (isApiRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('next', next);

  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
  const sessionSecret = process.env.PLEX_SESSION_SECRET;
  const session = request.cookies.get(COOKIE_NAME)?.value;

  if (!sessionSecret || session !== sessionSecret) {
    return denyUnauthenticatedRequest(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!login|api/login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
