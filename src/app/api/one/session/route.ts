import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  serverTimestamp, query, orderBy, limit
} from 'firebase/firestore';

async function safeGet(fn: () => Promise<any>, fallback: any) {
  try { return await fn(); } catch { return fallback; }
}

function getOrigin(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    'http://localhost:3000';
  return url.startsWith('http') ? url : `https://${url}`;
}

async function fetchRecallTags(): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/Manitec-HQ/Manitec-Dashboard/main/meta/recall.json',
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return {};
    const data = await res.json();
    delete data._readme;
    return data;
  } catch {
    return {};
  }
}

function matchRecallTags(
  intent: string,
  tags: Record<string, string>
): Record<string, string> {
  const lower = intent.toLowerCase();
  const matched: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (lower.includes(key.toLowerCase())) matched[key] = value;
  }
  return matched;
}

// Load session message history from one_sessions subcollection
async function loadSessionHistory(sessionId: string): Promise<{ role: string; content: string }[]> {
  return safeGet(async () => {
    const snap = await getDocs(
      query(
        collection(db, 'one_sessions', sessionId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(40)
      )
    );
    return snap.docs.map(d => {
      const data = d.data();
      return { role: data.role as string, content: data.content as string };
    });
  }, []);
}

// Call /api/speak, passing session history so Plex carries the thread.
async function callSpeak(
  message: string,
  sessionId: string,
  history: { role: string; content: string }[] = [],
  forceMode?: string
): Promise<string> {
  try {
    const origin = getOrigin();
    const res = await fetch(`${origin}/api/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sessionId,
        overrideHistory: history,
        forceMode: forceMode ?? 'session',
      }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.response ?? data.reply ?? '').trim();
  } catch {
    return '';
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('id');

  if (sessionId) {
    const session = await safeGet(async () => {
      const snap = await getDoc(doc(db, 'one_sessions', sessionId));
      if (!snap.exists()) return null;
      const msgs = await getDocs(
        query(collection(db, 'one_sessions', sessionId, 'messages'), orderBy('createdAt', 'asc'))
      );
      return {
        id: snap.id,
        ...snap.data(),
        messages: msgs.docs.map(d => ({ id: d.id, ...d.data() }))
      };
    }, null);
    return NextResponse.json({ session });
  }

  const sessions = await safeGet(async () => {
    const snap = await getDocs(
      query(collection(db, 'one_sessions'), orderBy('createdAt', 'desc'), limit(20))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }, []);

  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  // ── Start a new session ─────────────────────────────────────────────────────
  if (action === 'start') {
    if (!body.intent) return NextResponse.json({ error: 'missing intent' }, { status: 400 });

    const allTags = await fetchRecallTags();
    const matchedTags = matchRecallTags(body.intent, allTags);

    const recallContext = Object.entries(matchedTags).length > 0
      ? '\n\n[RECALL CONTEXT]\n' +
        Object.entries(matchedTags)
          .map(([k, v]) => `• ${k}: ${v}`)
          .join('\n')
      : '';

    const sessionRef = await safeGet(() =>
      addDoc(collection(db, 'one_sessions'), {
        intent: body.intent,
        status: 'open',
        recallTagsLoaded: Object.keys(matchedTags),
        recallTagsProposed: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }), null
    );

    if (!sessionRef) return NextResponse.json({ error: 'failed to create session' }, { status: 500 });

    // Fix 2: warm, present opening — not a cold ops brief
    const openingPrompt = [
      `A focused session with Joe is starting now. This is work mode — present, collaborative, no ceremony.`,
      `Session intent: ${body.intent}`,
      recallContext,
      `Acknowledge what you're here to work on. If you have relevant recall context, surface it briefly. Then ask the one question that would move things forward. Be yourself — direct, warm where it's earned, not performatively professional.`,
    ].filter(Boolean).join('\n\n');

    const plexReply = await callSpeak(openingPrompt, sessionRef.id, [], 'session');

    if (plexReply) {
      await safeGet(() =>
        addDoc(collection(db, 'one_sessions', sessionRef.id, 'messages'), {
          role: 'plex',
          content: plexReply,
          createdAt: serverTimestamp(),
        }), null
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId: sessionRef.id,
      recallTagsLoaded: Object.keys(matchedTags),
      plexReply,
    });
  }

  // ── Send a message ───────────────────────────────────────────────────────────
  if (action === 'message') {
    const { sessionId, content } = body;
    if (!sessionId || !content)
      return NextResponse.json({ error: 'missing sessionId or content' }, { status: 400 });

    // Fix 1: load history from one_sessions before storing the new message
    const history = await loadSessionHistory(sessionId);

    // Store user message
    await safeGet(() =>
      addDoc(collection(db, 'one_sessions', sessionId, 'messages'), {
        role: 'joe',
        content,
        createdAt: serverTimestamp(),
      }), null
    );

    // Pass full history + new message to speak
    const historyWithNew = [...history, { role: 'joe', content }];
    const plexReply = await callSpeak(content, sessionId, historyWithNew);

    if (plexReply) {
      await safeGet(() =>
        addDoc(collection(db, 'one_sessions', sessionId, 'messages'), {
          role: 'plex',
          content: plexReply,
          createdAt: serverTimestamp(),
        }), null
      );
    }

    await safeGet(() =>
      updateDoc(doc(db, 'one_sessions', sessionId), { updatedAt: serverTimestamp() }), null
    );

    return NextResponse.json({ ok: true, plexReply });
  }

  // ── Close session ────────────────────────────────────────────────────────────
  if (action === 'close') {
    const { sessionId } = body;
    if (!sessionId)
      return NextResponse.json({ error: 'missing sessionId' }, { status: 400 });

    const msgs = await safeGet(async () => {
      const snap = await getDocs(
        query(collection(db, 'one_sessions', sessionId, 'messages'), orderBy('createdAt', 'asc'))
      );
      return snap.docs.map(d => d.data());
    }, []);

    const transcript = msgs
      .map((m: any) => `${m.role === 'joe' ? 'Joe' : 'Plex'}: ${m.content}`)
      .join('\n');

    let proposedTags: Record<string, string> = {};
    const tagReply = await callSpeak(
      `Review this session transcript and propose 1-3 recall tags for future sessions. Short keyword (1-3 words, hyphenated) and a dense one-sentence value each. Return ONLY valid JSON: {"tag-name": "value", ...}\n\nTranscript:\n${transcript.slice(0, 4000)}`,
      sessionId,
      msgs.map((m: any) => ({ role: m.role, content: m.content })),
      'session'
    );
    if (tagReply) {
      try {
        const jsonMatch = tagReply.match(/\{[\s\S]*\}/);
        if (jsonMatch) proposedTags = JSON.parse(jsonMatch[0]);
      } catch { /* non-fatal */ }
    }

    await safeGet(() =>
      updateDoc(doc(db, 'one_sessions', sessionId), {
        status: 'closed',
        recallTagsProposed: Object.keys(proposedTags),
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }), null
    );

    return NextResponse.json({ ok: true, proposedTags });
  }

  // ── Commit recall tags ───────────────────────────────────────────────────────
  if (action === 'commit_recall') {
    const { tags } = body;
    if (!tags || typeof tags !== 'object')
      return NextResponse.json({ error: 'missing tags' }, { status: 400 });

    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) return NextResponse.json({ error: 'no github token' }, { status: 500 });

    const apiBase = 'https://api.github.com/repos/Manitec-HQ/Manitec-Dashboard/contents/meta/recall.json';
    const headers = {
      Authorization: `token ${ghToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    };

    try {
      const current = await fetch(apiBase, { headers }).then(r => r.json());
      const existingContent = JSON.parse(
        Buffer.from(current.content, 'base64').toString('utf-8')
      );
      const updated = { ...existingContent, ...tags };
      const encoded = Buffer.from(JSON.stringify(updated, null, 2)).toString('base64');
      await fetch(apiBase, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `recall: add tags from session — ${new Date().toISOString().slice(0, 10)}`,
          content: encoded,
          sha: current.sha,
        })
      });
    } catch {
      return NextResponse.json({ error: 'github write failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
