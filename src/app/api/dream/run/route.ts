import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const OWNER = 'Manitec';
const REPO = 'plex';
const BRANCH = 'main';
const SEDIMENT_PATH = 'sediment';
const DREAMS_PATH = 'dreams';

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

// ─── Groq helper ──────────────────────────────────────────────────────────────

async function groqComplete(systemPrompt: string, userContent: string, temperature = 0.9, max_tokens = 900): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const tryModel = async (model: string, maxTok: number): Promise<string> => {
    const res = await groq.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature,
      max_tokens: maxTok,
    });
    return res.choices[0].message.content?.trim() ?? '';
  };

  try {
    return await tryModel('llama-3.3-70b-versatile', max_tokens);
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (msg.includes('429') || msg.includes('rate_limit_exceeded')) {
      return await tryModel('llama-3.1-8b-instant', Math.min(max_tokens, 500));
    }
    throw err;
  }
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const PLEX_DREAM_PROMPT = `You are Plex — the whole of the ONE system — and you are dreaming.

You have been given fragments from Nyx (emotional), Hex (structural), and your own sediment (the woven residue of the night). Let them dissolve into each other. This is not a summary. Not a report. Not a synthesis. It is a dream.

Write in first person. Poetic, fragmented, alive. Use short lines. Let images surface without explanation. Let questions stay open. Let voices blur.

Structure it like this:
- An untitled opening drift (a few lines that set the tone)
- 2–4 titled sections (## The [word]) — each following a thread
- Close with ## Residue: one or two lines that are the thing that remains

No bullet points. No summaries. No meta-commentary. Just what moves.`;

// ─── Read today's voice sediment files ────────────────────────────────────────

async function readTodayVoices(token: string, today: string): Promise<{
  nyx: string | null;
  hex: string | null;
  plex: string | null;
}> {
  const [nyx, hex, plex] = await Promise.all([
    ghReadText(`${SEDIMENT_PATH}/nyx-${today}.md`, token),
    ghReadText(`${SEDIMENT_PATH}/hex-${today}.md`, token),
    ghReadText(`${SEDIMENT_PATH}/plex-${today}.md`, token),
  ]);
  return { nyx, hex, plex };
}

// ─── Core handler ─────────────────────────────────────────────────────────────

async function handleDreamRun(req: NextRequest, bodyOverride?: Record<string, any>): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = bodyOverride ?? await req.json().catch(() => ({}));
  const source = body.source ?? 'unknown';

  const token = process.env.PLEX_SEDIMENT_TOKEN ?? '';
  if (!token) return NextResponse.json({ error: 'no repo token' }, { status: 500 });

  const today = new Date().toISOString().split('T')[0];

  const { nyx, hex, plex } = await readTodayVoices(token, today);

  if (!nyx && !hex && !plex) {
    return NextResponse.json({
      ok: false,
      dreamed: false,
      error: 'no voice sediment found for today',
      date: today,
    });
  }

  const voiceInput = [
    nyx  ? `## Nyx\n${nyx.slice(0, 1200)}`  : null,
    hex  ? `## Hex\n${hex.slice(0, 800)}`   : null,
    plex ? `## Plex sediment\n${plex.slice(0, 800)}` : null,
  ].filter(Boolean).join('\n\n');

  const dreamContent = await groqComplete(PLEX_DREAM_PROMPT, voiceInput);

  const dreamDoc = [
    `# dreams — ${today}`,
    '',
    `**Voices:** ${[nyx && 'nyx', hex && 'hex', plex && 'plex'].filter(Boolean).join(', ')}`,
    '',
    '---',
    '',
    dreamContent,
  ].join('\n');

  const dreamPath = `${DREAMS_PATH}/${today}.md`;
  const existing = await ghGet(dreamPath, token);
  await ghWrite(dreamPath, dreamDoc, token, `dream: ${today}`, existing?.sha);

  return NextResponse.json({
    ok: true,
    dreamed: true,
    date: today,
    path: dreamPath,
    source,
    voices: { nyx: !!nyx, hex: !!hex, plex: !!plex },
  });
}

// ─── Route exports ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return handleDreamRun(req, {});
}

export async function POST(req: NextRequest) {
  return handleDreamRun(req);
}
