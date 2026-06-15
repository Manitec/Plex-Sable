import { NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.PLEX_SEDIMENT_TOKEN ?? process.env.GITHUB_TOKEN;
const OWNER = 'Manitec';
const REPO = 'Plex-Sable';
const PATH = 'sediment';

export async function GET() {
  try {
    if (!GITHUB_TOKEN) return NextResponse.json({ entries: [] });

    const listRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
    });

    if (!listRes.ok) return NextResponse.json({ entries: [] });
    const files: any[] = await listRes.json();

    const mdFiles = files
      .filter((f: any) => f.name.endsWith('.md'))
      .sort((a: any, b: any) => b.name.localeCompare(a.name))
      .slice(0, 20);

    const entries = await Promise.all(mdFiles.map(async (f: any) => {
      const res = await fetch(f.download_url, {
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
        next: { revalidate: 300 },
      });
      const content = await res.text();
      const date = f.name.replace('.md', '');
      return { date, content };
    }));

    return NextResponse.json({ entries });
  } catch (err: any) {
    return NextResponse.json({ entries: [], error: err?.message }, { status: 500 });
  }
}
