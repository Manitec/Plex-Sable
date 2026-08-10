import { NextRequest, NextResponse } from 'next/server';

const OWNER = 'Manitec';
const REPO = 'plex';
const BRANCH = 'main';
const CANONICAL_SEDIMENT = 'sediment/';
const DUPLICATE_SEDIMENT = 'plex/sediment/';

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

function archiveGuard(action: string, path: string, sha?: string) {
  if (path.startsWith(DUPLICATE_SEDIMENT)) {
    return 'duplicate sediment path is quarantined; use sediment/';
  }
  if (path.startsWith(CANONICAL_SEDIMENT) && action === 'delete') {
    return 'canonical sediment is append-only and cannot be deleted';
  }
  if (path.startsWith(CANONICAL_SEDIMENT) && action === 'write' && sha) {
    return 'canonical sediment cannot be overwritten through the generic repo API';
  }
  return null;
}

export async function GET(req: NextRequest) {
  const token = process.env.PLEX_SEDIMENT_TOKEN ?? '';
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path') ?? '';
  const read = searchParams.get('read');

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: headers(token), next: { revalidate: 60 } });
  if (!res.ok) return NextResponse.json({ error: 'github error', status: res.status }, { status: res.status });

  const data = await res.json();

  if (read === '1') {
    const content = Buffer.from(data.content ?? '', 'base64').toString('utf-8');
    return NextResponse.json({ content, sha: data.sha, path: data.path });
  }

  if (Array.isArray(data)) {
    return NextResponse.json(data.map((file: any) => ({ name: file.name, path: file.path, type: file.type, sha: file.sha })));
  }

  return NextResponse.json({ name: data.name, path: data.path, type: 'file', sha: data.sha });
}

export async function POST(req: NextRequest) {
  const token = process.env.PLEX_SEDIMENT_TOKEN ?? '';
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 500 });

  const body = await req.json();
  const { action, path, content, sha, message } = body;

  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const guardError = archiveGuard(action, path, sha);
  if (guardError) return NextResponse.json({ error: guardError }, { status: 403 });

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  if (action === 'write') {
    const payload: any = {
      message: message ?? `update ${path}`,
      content: Buffer.from(content ?? '').toString('base64'),
      branch: BRANCH,
    };
    if (sha) payload.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: false, error: err }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, sha: data.content?.sha });
  }

  if (action === 'delete') {
    if (!sha) return NextResponse.json({ error: 'sha required for delete' }, { status: 400 });
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message ?? `delete ${path}`, sha, branch: BRANCH }),
    });
    if (!res.ok) return NextResponse.json({ ok: false }, { status: res.status });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
