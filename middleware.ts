import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'plex_session';

function isApiRequest(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith('/api/');
}

function isAuthorizedSleepRequest(request: NextRequest): boolean {
  if (
    request.method !== 'POST' ||
    (request.nextUrl.pathname !== '/api/sleep' &&
      request.nextUrl.pathname !== '/api/dream/run')
  ) {
    return false;
  }

  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');

  return Boolean(
    cronSecret && authorization === `Bearer ${cronSecret}`,
  );
}

function denyUnauthenticatedRequest(request: NextRequest): NextResponse {
  if (isApiRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
  if (isAuthorizedSleepRequest(request)) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
