import { NextResponse } from 'next/server';

const OWNER = 'Manitec';
const REPO = 'plex';
const PATH = 'Projects';

export async function GET() {
  const token = process.env.PLEX_SEDIMENT_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) return NextResponse.json({ error: 'GitHub token unavailable' }, { status: 500 });

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=main`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' },
  );

  if (!res.ok) return NextResponse.json({ error: 'Unable to load shared projects' }, { status: res.status });

  const entries = (await res.json()) as Array<{ name: string; path: string; type: string; html_url: string }>;
  const projects = entries
    .filter((entry) => entry.type === 'dir')
    .map((entry) => ({ name: entry.name, path: entry.path, url: entry.html_url }));

  return NextResponse.json({ projects });
}
