import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

function matchesExpectedToken(token: string, expected: string): boolean {
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);

  if (tokenBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(tokenBuffer, expectedBuffer);
}

/**
 * Require the private Plex API token for a route request.
 *
 * Send the token in the `x-plex-token` request header. Tokens are intentionally
 * not accepted in query strings, which can leak through logs and referrers.
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.PLEX_API_TOKEN;

  if (!expected) {
    console.error('[api-auth] PLEX_API_TOKEN is not configured');
    return NextResponse.json(
      { error: 'Server auth misconfigured' },
      { status: 500 },
    );
  }

  const token = request.headers.get('x-plex-token');

  if (!token || !matchesExpectedToken(token, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
