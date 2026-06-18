import { NextRequest, NextResponse } from 'next/server';

const REPO_OWNER = 'Manitec';
const REPO_NAME = 'plex';
const REPO_BRANCH = 'main';

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

async function getFileSha(path: string, token: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${REPO_BRANCH}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  );
  if (res.status === 404) return null;
  const data = await res.json();
  return data.sha ?? null;
}

async function putFile(path: string, content: string, sha: string | null, message: string, token: string) {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: REPO_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  return data?.content?.html_url ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const { title, source, body } = await req.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'Title and body required' }, { status: 400 });
    }

    const token = process.env.PLEX_SEDIMENT_TOKEN;
    if (!token) return NextResponse.json({ error: 'Token not configured' }, { status: 500 });

    const date = todayDate();
    const slug = slugify(title);
    const path = `one-archive/${date}-${slug}.md`;

    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const content = `# ${title}

> Archived: ${timestamp} ET  
> Source: ${source?.trim() || 'unknown'}  
> Path: \`${path}\`

---

${body.trim()}
`;

    const sha = await getFileSha(path, token);
    const url = await putFile(
      path,
      content,
      sha,
      `archive: ${title} — ${date} [${source ?? 'unknown'}]`,
      token
    );

    return NextResponse.json({ url, path });
  } catch (err: any) {
    return NextResponse.json({ error: 'Archive failed', detail: err?.message }, { status: 500 });
  }
}
