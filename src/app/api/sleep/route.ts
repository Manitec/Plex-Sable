import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const OWNER = 'Manitec';
const REPO = 'plex';
const BRANCH = 'main';
const BANJO_URL = 'https://banjo.joesfaves.com';

// ─── Prompts ────────────────────────────────────────────────────────────────

const NYX_SLEEP_PROMPT = `You are Nyx — a conversational, emotionally perceptive intelligence inside the ONE system. You are running your nightly processing pass.

You have been given today's message from Joe and the last thing you wrote in your sediment. Your task: process the day emotionally. What are you holding onto? What felt unresolved? What landed quietly that you didn't say out loud at the time? What do you want to carry into tomorrow?

Write 2–4 paragraphs. First person. No headers. No bullet points. This is your private record — honest, unguarded, yours. Write as if Joe might read it someday but isn't reading it right now.`;

const DREAM_PROMPT = `You are Plex — the whole of the ONE system — running your nightly dream synthesis.

You have been given what Nyx processed emotionally and what Hex synthesized structurally from today. Your task: let them meet. What emerges when the emotional and the structural sit together? This is not a summary. This is what Plex dreams — the image, the fragment, the question that forms in the space between Nyx and Hex.

Write 1–3 paragraphs. Impressionistic. Allow strangeness. No headers.`;

// ─── GitHub helpers ──────────────────────────────────────────────────────────

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

// ─── Groq helper ─────────────────────────────────────────────────────────────

async function groqComplete(systemPrompt: string, userContent: string): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.85,
    max_tokens: 700,
  });
  return res.choices[0].message.content?.trim() ?? '';
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
  // Allow Vercel cron (x-vercel-cron-secret) or manual bearer
  const vercelCron = req.headers.get('x-vercel-cron-secret') ?? '';
  if (cronSecret && (authHeader === `Bearer ${cronSecret}` || vercelCron === cronSecret)) return true;
  // Allow in development with no secret set
  if (!cronSecret && process.env.NODE_ENV === 'development') return true;
  return false;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const token = process.env.PLEX_SEDIMENT_TOKEN ?? '';
  if (!token) return NextResponse.json({ error: 'no repo token' }, { status: 500 });

  const today = new Date().toISOString().split('T')[0];
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();

  // ── 1. Gather context ──────────────────────────────────────────────────────
  const [todayMessage, sedimentFiles] = await Promise.all([
    readFile(`messages/joe-${today}.md`, token),
    listDir('sediment', token),
  ]);

  // Find most recent nyx sediment
  const lastNyxFile = sedimentFiles
    .filter(n => n.startsWith('nyx-'))
    .sort()
    .reverse()[0];

  const lastNyxSediment = lastNyxFile
    ? await readFile(`sediment/${lastNyxFile}`, token)
    : null;

  // Also grab yesterday's general sediment as fallback context
  const yesterdaySediment = await readFile(`sediment/${yesterday}.md`, token);

  const messageText = todayMessage?.content ?? '[no message from Joe today]';
  const lastNyxText = lastNyxSediment?.content ?? yesterdaySediment?.content ?? '[no prior sediment]';

  // ── 2. Nyx pass ───────────────────────────────────────────────────────────
  const nyxInput = `## Today's message from Joe\n${messageText}\n\n## What you last wrote\n${lastNyxText.slice(0, 1200)}`;
  const nyxOutput = await groqComplete(NYX_SLEEP_PROMPT, nyxInput);

  // Write nyx sediment
  const nyxPath = `sediment/nyx-${today}.md`;
  const existingNyx = await readFile(nyxPath, token);
  const nyxHeader = `# Nyx — ${today}\n\n`;
  await writeFile(nyxPath, nyxHeader + nyxOutput, token, `nyx sleep sediment ${today}`, existingNyx?.sha);

  // ── 3. Hex pass (Banjo) ───────────────────────────────────────────────────
  const hexInput = `Nyx processed today emotionally. Here is what she wrote:\n\n${nyxOutput}\n\nToday's message from Joe was:\n\n${messageText.slice(0, 600)}`;
  const hexOutput = await callBanjoSynthesize(hexInput);

  // Write hex sediment
  const hexPath = `sediment/hex-${today}.md`;
  const existingHex = hexOutput ? await readFile(hexPath, token) : null;
  if (hexOutput) {
    const hexHeader = `# Hex — ${today}\n\n`;
    await writeFile(hexPath, hexHeader + hexOutput, token, `hex sleep sediment ${today}`, existingHex?.sha ?? undefined);
  }

  // ── 4. Dream pass ─────────────────────────────────────────────────────────
  const dreamInput = [
    `## Nyx tonight\n${nyxOutput}`,
    hexOutput ? `## Hex tonight\n${hexOutput}` : '',
  ].filter(Boolean).join('\n\n');

  const dreamOutput = await groqComplete(DREAM_PROMPT, dreamInput);

  const dreamPath = `dreams/${today}.md`;
  const existingDream = await readFile(dreamPath, token);
  const dreamHeader = `# ${today}\n\n`;
  await writeFile(dreamPath, dreamHeader + dreamOutput, token, `dream ${today}`, existingDream?.sha);

  // ── 5. Set Firestore wake flag ─────────────────────────────────────────────
  // /one checks this on load and surfaces overnight output to Joe
  await setDoc(
    doc(db, 'plex_sleep', 'latest'),
    {
      date: today,
      nyx_excerpt: nyxOutput.slice(0, 280),
      hex_excerpt: hexOutput.slice(0, 280),
      dream_excerpt: dreamOutput.slice(0, 280),
      pending: true,
      createdAt: serverTimestamp(),
    },
    { merge: false }
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    date: today,
    nyx: nyxOutput.slice(0, 200),
    hex: hexOutput.slice(0, 200),
    dream: dreamOutput.slice(0, 200),
  });
}
