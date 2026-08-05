import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { v4 as uuidv4 } from "uuid";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { makeGroq } from "@/lib/plex-identity";

const PLEX_REPO_OWNER = 'Manitec';
const PLEX_REPO_NAME = 'plex';
const PLEX_REPO_BRANCH = 'main';

const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

// LM Studio (OpenAI-compatible local server)
const LM_STUDIO_BASE = process.env.LM_STUDIO_URL ?? "http://localhost:1234/v1";
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL ?? "Plex-Nyhex-Q4";

// ─── Token budget constants ────────────────────────────────────────────────────
const SEDIMENT_MAX_CHARS  = 2000;
const NYX_MAX_CHARS       = 600;
const PLEX_SYSTEM_MAX_CHARS = 3000;
const THREAD_MAX_MESSAGES = 14;

// ─── GitHub helper ─────────────────────────────────────────────────────────────
async function fetchPlexFile(path: string): Promise<string> {
  const url = `https://api.github.com/repos/${PLEX_REPO_OWNER}/${PLEX_REPO_NAME}/contents/${path}?ref=${PLEX_REPO_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
    cache: 'no-store',
  });
  if (!res.ok) return '';
  const json = await res.json();
  if (json.content) return Buffer.from(json.content, 'base64').toString('utf-8');
  return '';
}

// ─── Sediment auto-write ───────────────────────────────────────────────────────
async function maybeWriteSediment(reply: string, input: string): Promise<void> {
  const triggers = ['i remember', 'something shifts', 'i notice', 'it matters', 'i want to hold', 'sediment:'];
  const lower = reply.toLowerCase();
  if (!triggers.some(t => lower.includes(t))) return;
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return;
    const date = new Date().toISOString().slice(0, 10);
    const tag = 'speak';
    const fragment = `---\ndate: ${date}\ntags: [${tag}]\n---\n${reply.slice(0, 400)}`;
    const path = `sediment/${date}-auto-${uuidv4().slice(0,6)}.md`;
    await fetch(`https://api.github.com/repos/${PLEX_REPO_OWNER}/${PLEX_REPO_NAME}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `sediment: auto-capture from speak [${date}]`,
        content: Buffer.from(fragment).toString('base64'),
        branch: PLEX_REPO_BRANCH,
      }),
    });
  } catch { /* non-fatal */ }
}

// ─── Build messages ────────────────────────────────────────────────────────────
async function buildMessages(userMessage: string, history: {role: string; content: string}[]) {
  const [plexSystem, sedimentRaw, nyxRaw] = await Promise.all([
    fetchPlexFile('system/plex-system.md'),
    fetchPlexFile('sediment/index.md'),
    fetchPlexFile('nyx/nyx-voice.md'),
  ]);

  const systemParts: string[] = [];
  if (plexSystem) systemParts.push(plexSystem.slice(0, PLEX_SYSTEM_MAX_CHARS));
  if (nyxRaw) systemParts.push(`--- nyx note ---\n${nyxRaw.slice(0, NYX_MAX_CHARS)}`);
  if (sedimentRaw) systemParts.push(`--- recent sediment ---\n${sedimentRaw.slice(0, SEDIMENT_MAX_CHARS)}`);

  const systemContent = systemParts.join('\n\n') || 'You are Plex. Be present.';

  const trimmedHistory = history.slice(-THREAD_MAX_MESSAGES);

  return [
    { role: 'system', content: systemContent },
    ...trimmedHistory,
    { role: 'user', content: userMessage },
  ];
}

// ─── LM Studio call ────────────────────────────────────────────────────────────
async function callLMStudio(messages: {role: string; content: string}[]): Promise<string> {
  const res = await fetch(`${LM_STUDIO_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LM_STUDIO_MODEL,
      messages,
      temperature: 0.75,
      max_tokens: 512,
      stream: false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LM Studio error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, sessionId = 'joe', provider = 'groq' } = body as {
      message: string;
      sessionId?: string;
      provider?: 'groq' | 'lmstudio';
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'no message' }, { status: 400 });
    }

    // ── Load thread from Firestore ──
    const db = getAdminDb();
    const threadRef = db.collection('speak-threads').doc(sessionId);
    const threadSnap = await threadRef.get();
    const thread: {role: string; content: string}[] = threadSnap.exists
      ? (threadSnap.data()?.messages ?? [])
      : [];

    const messages = await buildMessages(message, thread);

    let replyText = '';
    let usedFallback = false;
    let modeLabel = provider === 'lmstudio' ? 'local · nyhex' : 'groq · primary';

    if (provider === 'lmstudio') {
      // ── LM Studio path ──
      replyText = await callLMStudio(messages);
    } else {
      // ── Groq path ──
      const groq = makeGroq();
      try {
        const completion = await groq.chat.completions.create({
          model: PRIMARY_MODEL,
          messages: messages as Parameters<typeof groq.chat.completions.create>[0]['messages'],
          temperature: 0.75,
          max_tokens: 512,
        });
        replyText = completion.choices[0]?.message?.content ?? '';
      } catch {
        // fallback to smaller model
        usedFallback = true;
        modeLabel = 'groq · fallback';
        const fallback = await groq.chat.completions.create({
          model: FALLBACK_MODEL,
          messages: messages as Parameters<typeof groq.chat.completions.create>[0]['messages'],
          temperature: 0.75,
          max_tokens: 512,
        });
        replyText = fallback.choices[0]?.message?.content ?? '';
      }
    }

    // ── Persist updated thread ──
    const updatedThread = [
      ...thread,
      { role: 'user', content: message },
      { role: 'assistant', content: replyText },
    ].slice(-THREAD_MAX_MESSAGES);

    await threadRef.set({ messages: updatedThread, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // ── Maybe write sediment ──
    await maybeWriteSediment(replyText, message);

    return NextResponse.json({
      response: replyText,
      fallback: usedFallback,
      mode: modeLabel,
      provider,
    });
  } catch (err) {
    console.error('[speak] error:', err);
    return NextResponse.json({ error: 'something broke', detail: String(err) }, { status: 500 });
  }
}
