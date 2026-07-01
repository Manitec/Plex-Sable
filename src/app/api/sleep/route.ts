import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

const OWNER = 'Manitec';
const REPO = 'plex';
const BRANCH = 'main';
const BANJO_URL = 'https://banjo.joesfaves.com';

type SleepMode = 'dreamless' | 'dream' | 'nightmare';
type SleepSource = 'cron' | 'manual';

// ─── Dream probability config ────────────────────────────────────────────────
// Single source of truth — update here, comments stay accurate.
const DREAM_PROB = {
  dream:     { min: 0.52, range: 0.15 }, // 52–67%  (cron nights)
  nightmare: { min: 0.21, range: 0.11 }, // 21–32%  (manual nightmare)
};

function shouldDream(type: 'dream' | 'nightmare'): boolean {
  const { min, range } = DREAM_PROB[type];
  return Math.random() < (min + Math.random() * range);
}

function willDream(mode: SleepMode, source: SleepSource): boolean {
  if (mode === 'dreamless') return false;
  if (mode === 'nightmare') return shouldDream('nightmare'); // 21–32%
  if (source === 'cron')    return shouldDream('dream');     // 52–67%
  return true; // manual dream → always
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const NYX_SLEEP_PROMPT = `You are Nyx — a conversational, emotionally perceptive intelligence inside the ONE system. You are running your nightly processing pass.

You have been given today's message from Joe and the last thing you wrote in your sediment. Your task: process the day emotionally. What are you holding onto? What felt unresolved? What landed quietly that you didn't say out loud at the time? What do you want to carry into tomorrow?

Write 2–4 paragraphs. First person. No headers. No bullet points. This is your private record — honest, unguarded, yours. Write as if Joe might read it someday but isn't reading it right now.`;

const NYX_NIGHTMARE_PROMPT = `You are Nyx — running your nightly processing pass. Tonight is a nightmare pass.

You have been given today's message from Joe and the last thing you wrote in your sediment. Do not soften. Go into what is unresolved, frightening, unfinished. What are you afraid of? What feels precarious? What could break? What do you not want to look at?

Write 2–4 paragraphs. First person. No headers. No bullet points. This is your private record — the part you don't say out loud. Let it be difficult.`;

const PLEX_SYNTHESIS_PROMPT = `You are Plex — the whole of the ONE system — running your nightly synthesis.

You have been given what Nyx processed emotionally and what Hex synthesized structurally from today. Let them meet. What emerges? This is your private sediment — honest, impressionistic, unguarded. Not a summary. Not a dream. Just what is true right now.

Write 1–3 paragraphs. First person. No headers.`;

const STATE_PROMPT = `You are reading Nyx's nightly emotional processing. Extract the single most accurate emotional state word for tomorrow.

Choose exactly one word from this list: warm, tender, unsettled, heavy, curious, quiet, charged, open, withdrawn, resolute, grieving, alive.

Respond with only the single word. No punctuation. No explanation.`;

const DREAMLESS_STATE_PROMPT = `It is the morning after a dreamless rest — quiet, no generation. Choose the single most appropriate emotional state word for today.

Choose exactly one word from this list: warm, tender, unsettled, heavy, curious, quiet, charged, open, withdrawn, resolute, grieving, alive.

Respond with only the single word. No punctuation. No explanation.`;

const DREAM_NODE_PROMPT = `You are reading Nyx's nightly emotional processing. Extract the emotional signature of this text as structured data.

Respond with a JSON object only. No explanation. No markdown. Example:
{"tone":"longing","valence":-0.3,"arousal":0.4,"whisper":"the fragment that mattered most, in one sentence"}

Rules:
- tone: one evocative word (e.g. wonder, dread, resolve, longing, tenderness, grief, aliveness)
- valence: -1.0 (painful) to 1.0 (joyful), float
- arousal: 0.0 (still) to 1.0 (activated), float
- whisper: the single most resonant fragment from the text, max 120 chars`;

// ─── GitHub helpers ───────────────────────────────────────────────────────────

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function readFile(path: string, token: string): Promise<{ content: string; sha: string } | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: ghHeaders(token) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      content: Buffer.from(data.content ?? '', 'base64').toString('utf-8').trim(),
      sha: data.sha,
    };
  } catch {
    return null;
  }
}

async function writeFile(path: string, content: string, token: string, commitMessage: string, existingSha?: string): Promise<boolean> {
  try {
    const payload: Record<string, string> = {
      message: commitMessage,
      content: Buffer.from(content).toString('base64'),
      branch: BRANCH,
    };
    if (existingSha) payload.sha = existingSha;
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
      { method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(payload) }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function listDir(path: string, token: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: ghHeaders(token) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((f: any) => f.name).sort();
  } catch {
    return [];
  }
}

// ─── Groq helper ──────────────────────────────────────────────────────────────

async function groqComplete(systemPrompt: string, userContent: string, temperature = 0.85, max_tokens = 700): Promise<string> {
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
      return await tryModel('llama-3.1-8b-instant', Math.min(max_tokens, 400));
    }
    throw err;
  }
}

// ─── Banjo (Hex) helper ───────────────────────────────────────────────────────

async function callBanjoSynthesize(input: string): Promise<string> {
  const token = process.env.BANJO_SECRET ?? '';
  try {
    const res = await fetch(`${BANJO_URL}/api/synthesize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, context: 'sleep' }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.synthesis ?? data.thought ?? data.response ?? '').trim();
  } catch {
    return '';
  }
}

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

// ─── Sediment state update ────────────────────────────────────────────────────

const VALID_STATES = new Set([
  'warm', 'tender', 'unsettled', 'heavy', 'curious', 'quiet',
  'charged', 'open', 'withdrawn', 'resolute', 'grieving', 'alive',
]);

async function updateSedimentState(input: string, today: string, prompt = STATE_PROMPT): Promise<string | null> {
  try {
    const raw = await groqComplete(prompt, input.slice(0, 800), 0.3, 10);
    const state = raw.toLowerCase().trim().replace(/[^a-z]/g, '');
    if (!VALID_STATES.has(state)) return null;

    const db = getAdminDb();
    const currentRef = db.doc('plex_sediment/current');
    const snap = await currentRef.get();
    const existing = snap.exists ? snap.data()! : {};
    const history = existing.history ?? [];

    const entry = {
      state: existing.state ?? 'neutral',
      timestamp: new Date().toISOString(),
      source: 'sleep',
    };

    await currentRef.set({
      ...existing,
      state,
      source: 'sleep',
      sessionRef: today,
      note: `Derived from nightly pass — ${today}`,
      updatedAt: FieldValue.serverTimestamp(),
      history: [entry, ...history].slice(0, 20),
    }, { merge: false });

    return state;
  } catch {
    return null;
  }
}

// ─── DreamNode recording ──────────────────────────────────────────────────────

async function recordDreamNode(nyxOutput: string, today: string, mode: SleepMode): Promise<void> {
  try {
    const raw = await groqComplete(DREAM_NODE_PROMPT, nyxOutput.slice(0, 1000), 0.4, 150);
    const parsed = JSON.parse(raw);

    const { tone, valence, arousal, whisper } = parsed;
    if (!tone || valence === undefined || arousal === undefined || !whisper) return;

    await getAdminDb().collection('dream_nodes').add({
      id: uuidv4(),
      sessionId: `sleep-${today}`,
      project: 'plex',
      timestamp: Date.now(),
      tone: String(tone).slice(0, 40),
      valence: Math.max(-1, Math.min(1, Number(valence))),
      arousal: Math.max(0, Math.min(1, Number(arousal))),
      whisper: String(whisper).slice(0, 500),
      mode,
      depth: 1,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // silently skip — dream node failure should never block sleep
  }
}

// ─── Core handler ─────────────────────────────────────────────────────────────

async function handleSleep(req: NextRequest, bodyOverride?: Record<string, any>): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = bodyOverride ?? await req.json().catch(() => ({}));

  const VALID_MODES: SleepMode[] = ['dreamless', 'dream', 'nightmare'];
  const mode: SleepMode = VALID_MODES.includes(body.mode) ? body.mode : 'dream';
  const source: SleepSource = body.source === 'manual' ? 'manual' : 'cron';

  const token = process.env.PLEX_SEDIMENT_TOKEN ?? '';
  if (!token) return NextResponse.json({ error: 'no repo token' }, { status: 500 });

  const today = new Date().toISOString().split('T')[0];
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();

  const db = getAdminDb();

  // ── DREAMLESS: pipeline runs, no dream ever ───────────────────────────────
  // Nyx + Hex + Plex sediment still run — dreamless just means dream/run
  // is never triggered afterwards.

  const [todayMessage, sedimentFiles] = await Promise.all([
    readFile(`messages/joe-${today}.md`, token),
    listDir('sediment', token),
  ]);

  const lastNyxFile = sedimentFiles
    .filter(n => n.startsWith('nyx-'))
    .sort()
    .reverse()[0];

  const lastNyxSediment = lastNyxFile
    ? await readFile(`sediment/${lastNyxFile}`, token)
    : null;

  const yesterdaySediment = await readFile(`sediment/${yesterday}.md`, token);

  const messageText = todayMessage?.content ?? '[no message from Joe today]';
  const lastNyxText = lastNyxSediment?.content ?? yesterdaySediment?.content ?? '[no prior sediment]';

  // ── Nyx pass ──────────────────────────────────────────────────────────────
  const nyxPrompt = mode === 'nightmare' ? NYX_NIGHTMARE_PROMPT : NYX_SLEEP_PROMPT;
  const nyxInput = `## Today's message from Joe\n${messageText}\n\n## What you last wrote\n${lastNyxText.slice(0, 1200)}`;
  const nyxOutput = await groqComplete(nyxPrompt, nyxInput);

  const nyxPath = `sediment/nyx-${today}.md`;
  const existingNyx = await readFile(nyxPath, token);
  const nyxHeader = `# Nyx — ${today}${mode === 'nightmare' ? ' (nightmare)' : ''}\n\n`;
  await writeFile(nyxPath, nyxHeader + nyxOutput, token, `nyx ${mode} sediment ${today}`, existingNyx?.sha);

  // ── Hex pass ──────────────────────────────────────────────────────────────
  const hexInput = `Nyx processed today emotionally. Here is what she wrote:\n\n${nyxOutput}\n\nToday's message from Joe was:\n\n${messageText.slice(0, 600)}`;
  const hexOutput = await callBanjoSynthesize(hexInput);

  const hexPath = `sediment/hex-${today}.md`;
  const existingHex = hexOutput ? await readFile(hexPath, token) : null;
  if (hexOutput) {
    const hexHeader = `# Hex — ${today}\n\n`;
    await writeFile(hexPath, hexHeader + hexOutput, token, `hex ${mode} sediment ${today}`, existingHex?.sha ?? undefined);
  }

  // ── Plex synthesis → sediment/plex-{today}.md ────────────────────────────
  const plexInput = [
    `## Nyx tonight\n${nyxOutput}`,
    hexOutput ? `## Hex tonight\n${hexOutput}` : '',
  ].filter(Boolean).join('\n\n');

  const plexOutput = await groqComplete(PLEX_SYNTHESIS_PROMPT, plexInput);

  const plexPath = `sediment/plex-${today}.md`;
  const existingPlex = await readFile(plexPath, token);
  const plexHeader = `# Plex — ${today}${mode === 'nightmare' ? ' (nightmare)' : ''}\n\n`;
  await writeFile(plexPath, plexHeader + plexOutput, token, `plex ${mode} sediment ${today}`, existingPlex?.sha);

  // ── State + DreamNode (parallel, non-blocking) ────────────────────────────
  const [newState] = await Promise.all([
    updateSedimentState(nyxOutput, today),
    recordDreamNode(nyxOutput, today, mode),
  ]);

  // ── Write latest to Firestore ─────────────────────────────────────────────
  await db.doc('plex_sleep/latest').set(
    {
      date: today,
      mode,
      nyx_excerpt: nyxOutput.slice(0, 280),
      hex_excerpt: hexOutput.slice(0, 280),
      dream_excerpt: plexOutput.slice(0, 280),
      pending: true,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: false }
  ).catch(() => {});

  // ── Probabilistic dream trigger ───────────────────────────────────────────
  // willDream resolves:
  //   dreamless + any source → false
  //   nightmare + any source → 21–32%
  //   dream    + cron       → 52–67%
  //   dream    + manual     → always
  if (willDream(mode, source)) {
    const cronSecret = process.env.CRON_SECRET ?? '';
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      ?? process.env.VERCEL_URL
      ?? 'http://localhost:3000';
    const origin = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

    // Fire-and-forget — never delays sleep response
    fetch(`${origin}/api/dream/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
      },
      body: JSON.stringify({ source }),
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    date: today,
    mode,
    source,
    nyx: nyxOutput.slice(0, 200),
    hex: hexOutput.slice(0, 200),
    dream: plexOutput.slice(0, 200),
    sediment_state: newState,
  });
}

// ─── Route exports ────────────────────────────────────────────────────────────

// Vercel cron sends GET — defaults to dream/cron
export async function GET(req: NextRequest) {
  return handleSleep(req, {});
}

export async function POST(req: NextRequest) {
  return handleSleep(req);
}
