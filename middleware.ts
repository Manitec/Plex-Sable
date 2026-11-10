import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'plex_sable_auth';

function isApiRequest(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith('/api/');
}

// Machine callers only, and only with a configured secret that matches exactly.
// A missing/empty secret never authorizes, and no header authorizes on its own.
function hasValidCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authorization = request.headers.get('authorization') ?? '';
  return authorization === `Bearer ${cronSecret}`;
}

// /api/sleep     — GET or POST, secret required (scheduled and manual machine callers)
// /api/dream/run — POST only, secret required (unchanged)
function isAuthorizedSecretRequest(request: NextRequest): boolean {
  if (!hasValidCronSecret(request)) return false;

  const path = request.nextUrl.pathname;
  if (path === '/api/sleep') {
    return request.method === 'GET' || request.method === 'POST';
  }
  if (path === '/api/dream/run') {
    return request.method === 'POST';
  }
  return false;
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
  if (isAuthorizedSecretRequest(request)) {
    return NextResponse.next();
  }

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
