import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'plex_sable_auth';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function matchesExpectedValue(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  const password = process.env.PLEX_GATE_PASSWORD;
  const sessionSecret = process.env.PLEX_SESSION_SECRET;

  if (!password || !sessionSecret) {
    console.error(
      '[plex-auth] PLEX_GATE_PASSWORD or PLEX_SESSION_SECRET is not configured',
    );

    return NextResponse.json(
      { error: 'Plex-Sable auth is not configured' },
      { status: 500 },
    );
  }

  let body: { password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  if (
    typeof body.password !== 'string' ||
    !matchesExpectedValue(body.password, password)
  ) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(COOKIE_NAME, sessionSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
  });

  return response;
}
