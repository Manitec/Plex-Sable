import { NextRequest, NextResponse } from 'next/server';

const OWNER = 'Manitec';
const REPO = 'plex';
const BRANCH = 'main';
const SEDIMENT_PATH = 'sediment';
const DREAMS_PATH = 'dreams';
const FRAGMENT_COUNT = 7;
const VOICES = ['plex', 'nyx', 'hex'];

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  const vercelCron = req.headers.get('x-vercel-cron') ?? '';

  if (vercelCron === '1') return true;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (!cronSecret && process.env.NODE_ENV === 'development') return true;

  return false;
}

// ─── GitHub helpers ───────────────────────────────────────────────────────────

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function ghGet(path: string, token: string): Promise<any | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: ghHeaders(token) }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function ghReadText(path: string, token: string): Promise<string | null> {
  const data = await ghGet(path, token);
  if (!data?.content) return null;
  return Buffer.from(data.content, 'base64').toString('utf-8').trim();
}

async function ghWrite(path: string, content: string, token: string, message: string, sha?: string): Promise<boolean> {
  try {
    const payload: Record<string, string> = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch: BRANCH,
    };
    if (sha) payload.sha = sha;
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
      { method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(payload) }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function ghListDir(path: string, token: string): Promise<{ name: string; path: string }[]> {
  const data = await ghGet(path, token);
  if (!Array.isArray(data)) return [];
  return data.map((f: any) => ({ name: f.name, path: f.path }));
}

// ─── Fragment parsing ─────────────────────────────────────────────────────────

interface Fragment {
  text: string;
  voice: string;
  mode: string;
  timestamp: string | null;
  source: string;
}

function parseFragments(raw: string, source: string): Fragment[] {
  return raw
    .split(/---\s*\n+---/)
    .map(block => block.trim())
    .filter(block => block.length > 20)
    .map(block => {
      const modeMatch = block.match(/\[([\w-]+)\s*—\s*([\w]+)\s*—\s*([^\]]+)\]/);
      return {
        text: block.replace(/\*\[.*?\]\*/g, '').trim(),
        voice: modeMatch?.[1] ?? source,
        mode: modeMatch?.[2] ?? 'unknown',
        timestamp: modeMatch?.[3]?.trim() ?? null,
        source,
      };
    })
    .filter(f => f.text.length > 20);
}

// ─── Fetch all sediment fragments ────────────────────────────────────────────

async function fetchAllFragments(token: string): Promise<Fragment[]> {
  const files = await ghListDir(SEDIMENT_PATH, token);
  const allFragments: Fragment[] = [];

  for (const file of files) {
    if (!file.name.endsWith('.md') || file.name === 'README.md') continue;

    let voice = 'plex';
    for (const v of VOICES) {
      if (file.name.startsWith(v + '-')) { voice = v; break; }
    }

    const raw = await ghReadText(file.path, token);
    if (!raw) continue;

    allFragments.push(...parseFragments(raw, voice));
  }

  return allFragments;
}

// ─── Sample random fragments ──────────────────────────────────────────────────

function sampleRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ─── Weave fragments into dream markdown ──────────────────────────────────────

function weaveDream(fragments: Fragment[], date: string, sources: string[]): string {
  const lines: string[] = [];

  lines.push(`# dreams — ${date}`);
  lines.push('');
  lines.push(`**Fragments used:** ${sources.join(', ')}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Group by voice
  const byVoice: Record<string, Fragment[]> = {};
  for (const f of fragments) {
    if (!byVoice[f.voice]) byVoice[f.voice] = [];
    byVoice[f.voice].push(f);
  }

  // Interleave voices
  const voiceKeys = Object.keys(byVoice);
  const woven: Fragment[] = [];
  let i = 0;
  while (woven.length < fragments.length) {
    const v = voiceKeys[i % voiceKeys.length];
    if (byVoice[v]?.length > 0) woven.push(byVoice[v].shift()!);
    i++;
    if (i > fragments.length * 3) break;
  }

  for (const f of woven) {
    lines.push(f.text);
    lines.push('');
    if (f.timestamp) {
      lines.push(`*[${f.voice} — ${f.mode} — ${f.timestamp}]*`);
    } else {
      lines.push(`*[${f.voice} — ${f.mode}]*`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Residue — voice breakdown
  const voiceSummary = voiceKeys
    .map(v => `${v}: ${fragments.filter(f => f.voice === v).length}`)
    .join(', ');

  lines.push(`## Residue`);
  lines.push('');
  lines.push(`*fragments: ${fragments.length} — ${voiceSummary}*`);

  return lines.join('\n');
}

// ─── Core handler ─────────────────────────────────────────────────────────────

async function handleDreamRun(req: NextRequest, bodyOverride?: Record<string, any>): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // dream/run is always called after willDream() has already resolved —
  // it runs unconditionally. source is passed through for logging only.
  const body = bodyOverride ?? await req.json().catch(() => ({}));
  const source = body.source ?? 'unknown';

  const token = process.env.PLEX_SEDIMENT_TOKEN ?? '';
  if (!token) return NextResponse.json({ error: 'no repo token' }, { status: 500 });

  const today = new Date().toISOString().split('T')[0];

  const allFragments = await fetchAllFragments(token);

  if (allFragments.length < 5) {
    return NextResponse.json({
      ok: false,
      dreamed: false,
      error: 'insufficient sediment',
      count: allFragments.length,
    });
  }

  const sampled = sampleRandom(allFragments, Math.min(FRAGMENT_COUNT, allFragments.length));
  const sources = [...new Set(sampled.map(f => f.source))];
  const content = weaveDream(sampled, today, sources);

  // Idempotent — overwrites if dream already exists today
  const dreamPath = `${DREAMS_PATH}/${today}.md`;
  const existing = await ghGet(dreamPath, token);
  await ghWrite(dreamPath, content, token, `dream: nightly synthesis ${today}`, existing?.sha);

  const voiceBreakdown: Record<string, number> = {};
  for (const f of sampled) {
    voiceBreakdown[f.voice] = (voiceBreakdown[f.voice] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    dreamed: true,
    date: today,
    path: dreamPath,
    source,
    fragmentCount: sampled.length,
    totalAvailable: allFragments.length,
    voices: voiceBreakdown,
  });
}

// ─── Route exports ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return handleDreamRun(req, {});
}

export async function POST(req: NextRequest) {
  return handleDreamRun(req);
}
