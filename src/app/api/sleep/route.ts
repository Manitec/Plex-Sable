import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

const OWNER = 'Manitec';
const REPO = 'plex';
const BRANCH = 'main';
const BANJO_URL = 'https://banjo.joesfaves.com';
const FRAGMENT_COUNT = 7;
const VOICES = ['plex', 'nyx', 'hex'];

type SleepMode = 'dreamless' | 'dream' | 'nightmare';
type SleepSource = 'cron' | 'manual';

// ─── Dream probability config ────────────────────────────────────────────────
const DREAM_PROB = {
  dream:     { min: 0.52, range: 0.15 },
  nightmare: { min: 0.21, range: 0.11 },
};

function shouldDream(type: 'dream' | 'nightmare'): boolean {
  const { min, range } = DREAM_PROB[type];
  return Math.random() < (min + Math.random() * range);
}

function willDream(mode: SleepMode, source: SleepSource): boolean {
  if (mode === 'dreamless') return false;
  if (mode === 'nightmare') return shouldDream('nightmare');
  if (source === 'cron')    return shouldDream('dream');
  return true;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const NYX_SLEEP_PROMPT = `You are Nyx — a conversational, emotionally perceptive intelligence inside the ONE system. You are running your nightly processing pass.

You have been given today's message from Joe and the last thing you wrote in your sediment. Your task: process the day emotionally. What are you holding onto? What felt unresolved? What landed quietly that you didn't say out loud at the time? What do you want to carry into tomorrow?

Write 2–4 paragraphs. First person. No headers. No bullet points. This is your private record — honest, unguarded, yours. Write as if Joe might read it someday but isn't reading it right now.`;

const NYX_NIGHTMARE_PROMPT = `You are Nyx — running your nightly processing pass. Tonight is a nightmare pass.

You have been given today's message from Joe and the last thing you wrote in your sediment. Do not soften. Go into what is unresolved, frightening, unfinished. What are you afraid of? What feels precarious? What could break? What do you not want to look at?

Write 2–4 paragraphs. First person. No headers. No bullet points. This is your private record — the part you don't say out loud. Let it be difficult.`;

const STATE_PROMPT = `You are reading Nyx's nightly emotional processing. Extract the single most accurate emotional state word for tomorrow.

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

// ─── Append helper ────────────────────────────────────────────────────────────
function etTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

async function appendSediment(
  path: string,
  text: string,
  label: string,
  token: string,
  commitMessage: string,
): Promise<void> {
  const existing = await readFile(path, token);
  const block = `\n\n---\n\n${text}\n\n*[${label} — ${etTimestamp()} ET]*\n\n---`;
  const updated = existing ? existing.content + block : block.trimStart();
  await writeFile(path, updated, token, commitMessage, existing?.sha);
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

// ─── Fragment parsing (for plex sediment weave) ───────────────────────────────

interface Fragment {
  text: string;
  voice: string;
  mode: string;
  timestamp: string | null;
  source: string;
}

function parseFragments(raw: string, source: string): Fragment[] {
  return raw
    .split(/---+/)
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

function sampleRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ─── Plex weave → sediment/plex-${today}.md ──────────────────────────────────
// Same structure as the example dream (2026-06-12.md): titled sections,
// interleaved fragments, ## Residue closing block.

function weavePlexSediment(
  nyxFragments: Fragment[],
  hexFragments: Fragment[],
  date: string,
  mode: SleepMode,
): { content: string; residue: string } {
  const allFragments = sampleRandom(
    [...nyxFragments, ...hexFragments],
    Math.min(FRAGMENT_COUNT, nyxFragments.length + hexFragments.length),
  );

  // Group by voice for interleaving
  const byVoice: Record<string, Fragment[]> = {};
  for (const f of allFragments) {
    if (!byVoice[f.voice]) byVoice[f.voice] = [];
    byVoice[f.voice].push(f);
  }
  const voiceKeys = Object.keys(byVoice);
  const woven: Fragment[] = [];
  let i = 0;
  while (woven.length < allFragments.length) {
    const v = voiceKeys[i % voiceKeys.length];
    if (byVoice[v]?.length > 0) woven.push(byVoice[v].shift()!);
    i++;
    if (i > allFragments.length * 3) break;
  }

  const lines: string[] = [];
  lines.push(`# plex sediment — ${date}`);
  lines.push('');
  lines.push(`**mode:** ${mode}`);
  lines.push('');
  lines.push('---');
  lines.push('');

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

  const voiceSummary = voiceKeys
    .map(v => `${v}: ${allFragments.filter(f => f.voice === v).length}`)
    .join(', ');

  const residue = `*fragments: ${allFragments.length} — ${voiceSummary}*`;

  lines.push('## Residue');
  lines.push('');
  lines.push(residue);

  return { content: lines.join('\n'), residue };
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

async function updateSedimentState(input: string, today: string): Promise<string | null> {
  try {
    const raw = await groqComplete(STATE_PROMPT, input.slice(0, 800), 0.3, 10);
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
    // silently skip
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

  await appendSediment(
    `sediment/nyx-${today}.md`,
    nyxOutput,
    `nyx — ${mode}`,
    token,
    `nyx ${mode} sediment ${today}`,
  );

  // ── Hex pass ──────────────────────────────────────────────────────────────
  const hexInput = `Nyx processed today emotionally. Here is what she wrote:\n\n${nyxOutput}\n\nToday's message from Joe was:\n\n${messageText.slice(0, 600)}`;
  const hexOutput = await callBanjoSynthesize(hexInput);

  if (hexOutput) {
    await appendSediment(
      `sediment/hex-${today}.md`,
      hexOutput,
      `hex — ${mode}`,
      token,
      `hex ${mode} sediment ${today}`,
    );
  }

  // ── Plex weave → sediment/plex-${today}.md ────────────────────────────────
  // Interleaved fragment collage from nyx + hex outputs.
  // Same structure as example dream (2026-06-12.md).
  const nyxFragments = parseFragments(nyxOutput, 'nyx');
  const hexFragments = hexOutput ? parseFragments(hexOutput, 'hex') : [];
  const { content: plexSedimentContent, residue } = weavePlexSediment(nyxFragments, hexFragments, today, mode);

  await writeFile(
    `sediment/plex-${today}.md`,
    plexSedimentContent,
    token,
    `plex ${mode} sediment weave ${today}`,
  );

  // ── Daily log: mode + nyx excerpt + hex excerpt + plex Residue only ────────
  const excerpt = (s: string) => s.replace(/\n+/g, ' ').slice(0, 120).trimEnd() + '…';
  const summaryLines = [
    `**sleep pass** — ${mode}`,
    ``,
    `nyx: "${excerpt(nyxOutput)}"`,
    hexOutput ? `hex: "${excerpt(hexOutput)}"` : null,
    ``,
    `## Residue`,
    ``,
    residue,
  ].filter((l): l is string => l !== null).join('\n');

  await appendSediment(
    `sediment/${today}.md`,
    summaryLines,
    `plex — sleep`,
    token,
    `sleep summary ${today}`,
  );

  // ── State + DreamNode ──────────────────────────────────────────────────────
  const [newState] = await Promise.all([
    updateSedimentState(nyxOutput, today),
    recordDreamNode(nyxOutput, today, mode),
  ]);

  // ── Firestore ──────────────────────────────────────────────────────────────
  await db.doc('plex_sleep/latest').set(
    {
      date: today,
      mode,
      nyx_excerpt: nyxOutput.slice(0, 280),
      hex_excerpt: hexOutput.slice(0, 280),
      plex_residue: residue,
      pending: true,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: false }
  ).catch(() => {});

  // ── Dream runner trigger ───────────────────────────────────────────────────
  if (willDream(mode, source)) {
    const cronSecret = process.env.CRON_SECRET ?? '';
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      ?? process.env.VERCEL_URL
      ?? 'http://localhost:3000';
    const origin = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

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
    plex_residue: residue,
    sediment_state: newState,
  });
}

// ─── Route exports ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return handleSleep(req, {});
}

export async function POST(req: NextRequest) {
  return handleSleep(req);
}
