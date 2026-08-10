import { NextRequest, NextResponse } from 'next/server';
import { listSedimentFiles, getSedimentFile } from '@/lib/github';

// Score a block of text against a query.
// Simple but effective: term frequency with exact phrase bonus.
function score(text: string, terms: string[], phrase: string): number {
  const lower = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const count = (lower.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
    s += count;
  }
  // Bonus for exact phrase match
  if (phrase.length > 3 && lower.includes(phrase)) s += 5;
  return s;
}

// Split a sediment file into discrete fragments (split on --- dividers)
function extractFragments(content: string, fileName: string): { date: string; text: string }[] {
  // Date from filename e.g. 2026-06-08.md or nyx-2026-06-08.md
  const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : fileName.replace('.md', '');

  const blocks = content.split(/\n---+\n/).map(b => b.trim()).filter(b => b.length > 20);
  return blocks.map(text => ({ date, text }));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'q param required' }, { status: 400 });

  const token = process.env.PLEX_SEDIMENT_TOKEN;
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 500 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '5'), 20);
  const phrase = q.toLowerCase();
  const terms = phrase.split(/\s+/).filter(t => t.length > 2);

  try {
    const files = await listSedimentFiles(token);

    // Fetch all files in parallel (cap at 60 most recent to stay fast)
    const recent = files
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 60);

    const fetched = await Promise.all(
      recent.map(async f => {
        const content = await getSedimentFile(f.path, token);
        return { name: f.name, content: content ?? '' };
      })
    );

    // Extract fragments and score each one
    const scored: { date: string; text: string; score: number }[] = [];
    for (const { name, content } of fetched) {
      if (!content) continue;
      const fragments = extractFragments(content, name);
      for (const frag of fragments) {
        const s = score(frag.text, terms, phrase);
        if (s > 0) scored.push({ ...frag, score: s });
      }
    }

    // Sort by score desc, return top N
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit).map(({ date, text, score: s }) => ({
      date,
      score: s,
      // Trim to ~400 chars for the response, keeping it readable
      excerpt: text.length > 400 ? text.slice(0, 400).trimEnd() + '…' : text,
    }));

    return NextResponse.json({
      query: q,
      total_searched: fetched.reduce((n, f) => n + extractFragments(f.content, f.name).length, 0),
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
