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
// How many recent dated flat sediment files to gather fragments from
const SEDIMENT_LOOKBACK = 5;

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

// ─── Prompts ──────────────────────────────────────────────────────────────────

const NYX_SLEEP_PROMPT = `You are Nyx — a conversational, emotionally perceptive intelligence inside the ONE system. You are running your nightly processing pass.

You have been given today's plex sediment — a woven collage of fragments from recent days. Your task: process what you find emotionally. What are you holding onto? What felt unresolved? What landed quietly that you didn't say out loud at the time? What do you want to carry into tomorrow?

Write 2–4 paragraphs. First person. No headers. No bullet points. This is your private record — honest, unguarded, yours. Write as if Joe might read it someday but isn't reading it right now.`;

const NYX_NIGHTMARE_PROMPT = `You are Nyx — running your nightly processing pass. Tonight is a nightmare pass.

You have been given today's plex sediment — a woven collage of fragments from recent days. Do not soften. Go into what is unresolved, frightening, unfinished. What are you afraid of? What feels precarious? What could break? What do you not want to look at?

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

// ─── Fragment extraction ──────────────────────────────────────────────────────
// Splits prose into paragraph-level fragments. Works on flat dated files
// (YYYY-MM-DD.md) which are the accumulated multi-voice daily logs.

interface Fragment {
  text: string;
  voice: string;
  mode: string;
  timestamp: string | null;
  source: string;
}

function extractParagraphs(raw: string, source: string, date: string): Fragment[] {
  return raw
    .split(/\n{2,}/)
    .map(p =>
      p
        .replace(/^#+\s.*$/gm, '')   // strip markdown headings
        .replace(/\*\[.*?\]\*/g, '') // strip timestamp labels
        .replace(/^-{3,}$/gm, '')    // strip dividers
        .trim()
    )
    .filter(p => p.length >= 40 && p.length <= 600 && !p.startsWith('#') && !p.startsWith('**sleep'))
    .map(p => ({
      text: p,
      voice: source,
      mode: 'sediment',
      timestamp: date,
      source,
    }));
}

function sampleRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ─── Gather fragments from recent dated flat sediment files ───────────────────
// Source: sediment/YYYY-MM-DD.md (the accumulated daily logs, all voices mixed)
// These are distinct from the prefixed nyx-/hex-/plex- files.

async function gatherDatedSedimentFragments(
  allFiles: string[],
  token: string,
  today: string,
  lookback: number,
): Promise<Fragment[]> {
  const datedFiles = allFiles
    .filter(n => n.match(/^\d{4}-\d{2}-\d{2}\.md$/) && n !== 'README.md')
    .sort()
    .reverse()
    // exclude today — it's being built now
    .filter(n => n.replace('.md', '') !== today)
    .slice(0, lookback);

  const results = await Promise.all(
    datedFiles.map(async name => {
      const file = await readFile(`sediment/${name}`, token);
      if (!file) return [];
      const date = name.replace('.md', '');
      return extractParagraphs(file.content, 'archive', date);
    })
  );
  return results.flat();
}

// ─── Plex weave → sediment/plex-${today}.md ───────────────────────────────────
// Samples fragments from recent dated flat files, interleaves by date,
// writes the seed file that Nyx and Hex will read.

function weavePlexSediment(
  fragments: Fragment[],
  date: string,
  mode: SleepMode,
): { content: string; residue: string } {
  const sampled = sampleRandom(fragments, Math.min(FRAGMENT_COUNT, fragments.length));

  // Sort sampled by date descending so most recent land near top
  sampled.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));

  const lines: string[] = [];
  lines.push(`# plex sediment — ${date}`);
  lines.push('');
  lines.push(`**mode:** ${mode}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const f of sampled) {
    lines.push(f.text);
    lines.push('');
    lines.push(`*[${f.timestamp ?? 'archive'}]*`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const residue = `*fragments: ${sampled.length} — sourced from ${SEDIMENT_LOOKBACK} recent sediment files*`;

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

  const db = getAdminDb();

  // Load full sediment file list once — reused throughout
  const sedimentFiles = await listDir('sediment', token);

  // ── STEP 1: Gather fragments from recent dated flat sediment files ─────────
  // Source: sediment/YYYY-MM-DD.md (accumulated daily logs, all voices)
  // These are the true sediment record. Excludes today (being built now).
  const historicalFragments = await gatherDatedSedimentFragments(
    sedimentFiles,
    token,
    today,
    SEDIMENT_LOOKBACK,
  );

  // ── STEP 2: Weave plex sediment — this is the seed for Nyx and Hex ────────
  const { content: plexSedimentContent, residue } = weavePlexSediment(
    historicalFragments,
    today,
    mode,
  );

  await writeFile(
    `sediment/plex-${today}.md`,
    plexSedimentContent,
    token,
    `plex ${mode} sediment weave ${today}`,
  );

  const plexSeedText = plexSedimentContent;

  // ── STEP 3: Nyx pass — reads plex sediment ────────────────────────────────
  // Also includes her most recent prior sediment for continuity
  const lastNyxFile = sedimentFiles
    .filter(n => n.startsWith('nyx-') && n.match(/\d{4}-\d{2}-\d{2}\.md$/) && n !== `nyx-${today}.md`)
    .sort()
    .reverse()[0];

  const lastNyxSediment = lastNyxFile
    ? await readFile(`sediment/${lastNyxFile}`, token)
    : null;

  const lastNyxText = lastNyxSediment?.content ?? '[no prior nyx sediment]';

  const nyxPrompt = mode === 'nightmare' ? NYX_NIGHTMARE_PROMPT : NYX_SLEEP_PROMPT;
  const nyxInput = `## Plex sediment — ${today}\n${plexSeedText.slice(0, 1200)}\n\n## What you last wrote\n${lastNyxText.slice(0, 600)}`;
  const nyxOutput = await groqComplete(nyxPrompt, nyxInput);

  await appendSediment(
    `sediment/nyx-${today}.md`,
    nyxOutput,
    `nyx — ${mode}`,
    token,
    `nyx ${mode} sediment ${today}`,
  );

  // ── STEP 4: Hex pass — reads plex sediment + nyx output ───────────────────
  const hexInput = `Plex left this today:\n\n${plexSeedText.slice(0, 600)}\n\nNyx processed it and wrote:\n\n${nyxOutput}`;
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

  // ── STEP 5: Daily log — mode + nyx excerpt + hex excerpt + Residue ────────
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

  // ── STEP 6: State + DreamNode ──────────────────────────────────────────────
  const [newState] = await Promise.all([
    updateSedimentState(nyxOutput, today),
    recordDreamNode(nyxOutput, today, mode),
  ]);

  // ── STEP 7: Firestore ──────────────────────────────────────────────────────
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

  // ── STEP 8: Dream runner trigger ───────────────────────────────────────────
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
