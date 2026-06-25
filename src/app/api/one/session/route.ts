import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  serverTimestamp, query, orderBy, limit
} from 'firebase/firestore';

async function safeGet(fn: () => Promise<any>, fallback: any) {
  try { return await fn(); } catch { return fallback; }
}

// Fetch recall tags from GitHub
async function fetchRecallTags(): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/Manitec-HQ/Manitec-Dashboard/main/meta/recall.json',
      { next: { revalidate: 300 } } // cache 5 min
    );
    if (!res.ok) return {};
    const data = await res.json();
    delete data._readme;
    return data;
  } catch {
    return {};
  }
}

// Match tags to intent string
function matchRecallTags(
  intent: string,
  tags: Record<string, string>
): Record<string, string> {
  const lower = intent.toLowerCase();
  const matched: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (lower.includes(key.toLowerCase())) {
      matched[key] = value;
    }
  }
  return matched;
}

// GET: list sessions or get single session
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

  // List recent sessions
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

  // Start a new session
  if (action === 'start') {
    if (!body.intent) return NextResponse.json({ error: 'missing intent' }, { status: 400 });

    const allTags = await fetchRecallTags();
    const matchedTags = matchRecallTags(body.intent, allTags);

    // Build Plex context from matched tags
    const recallContext = Object.entries(matchedTags).length > 0
      ? '\n\n[RECALL TAGS LOADED]\n' +
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

    // Plex opening message
    const openingPrompt = `You are Plex. A new focused work session is starting.\n\nSession intent: ${body.intent}${recallContext}\n\nAcknowledge the session intent, note any recall context you have, and ask what the first step is. Be direct and present — this is work mode.`;

    let plexReply = '';
    try {
      const plexRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: openingPrompt, sessionId: sessionRef.id, mode: 'OPERATIONAL' })
      });
      if (plexRes.ok) {
        const plexData = await plexRes.json();
        plexReply = plexData.reply ?? '';
      }
    } catch { /* non-fatal */ }

    // Store Plex opening message
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

  // Send a message in an existing session
  if (action === 'message') {
    const { sessionId, content } = body;
    if (!sessionId || !content)
      return NextResponse.json({ error: 'missing sessionId or content' }, { status: 400 });

    // Store user message
    await safeGet(() =>
      addDoc(collection(db, 'one_sessions', sessionId, 'messages'), {
        role: 'joe',
        content,
        createdAt: serverTimestamp(),
      }), null
    );

    // Get Plex reply
    let plexReply = '';
    try {
      const plexRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, sessionId, mode: 'OPERATIONAL' })
      });
      if (plexRes.ok) {
        const plexData = await plexRes.json();
        plexReply = plexData.reply ?? '';
      }
    } catch { /* non-fatal */ }

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

  // Close session — Plex proposes recall tags
  if (action === 'close') {
    const { sessionId } = body;
    if (!sessionId)
      return NextResponse.json({ error: 'missing sessionId' }, { status: 400 });

    // Get session messages for summary
    const msgs = await safeGet(async () => {
      const snap = await getDocs(
        query(collection(db, 'one_sessions', sessionId, 'messages'), orderBy('createdAt', 'asc'))
      );
      return snap.docs.map(d => d.data());
    }, []);

    const transcript = msgs
      .map((m: any) => `${m.role === 'joe' ? 'Joe' : 'Plex'}: ${m.content}`)
      .join('\n');

    // Ask Plex to propose recall tags
    let proposedTags: Record<string, string> = {};
    try {
      const plexRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Review this session transcript and propose 1-3 new recall tags that would help future sessions pick up context faster. Each tag: a short keyword (1-3 words, hyphenated) and a dense 1-sentence value. Return ONLY valid JSON in this format: {"tag-name": "context string", ...}. Transcript:\n\n${transcript.slice(0, 4000)}`,
          sessionId,
          mode: 'OPERATIONAL'
        })
      });
      if (plexRes.ok) {
        const plexData = await plexRes.json();
        const raw = plexData.reply ?? '{}';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) proposedTags = JSON.parse(jsonMatch[0]);
      }
    } catch { /* non-fatal — user can still close */ }

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

  // Commit approved recall tags back to GitHub
  if (action === 'commit_recall') {
    const { tags } = body; // { tagKey: tagValue, ... }
    if (!tags || typeof tags !== 'object')
      return NextResponse.json({ error: 'missing tags' }, { status: 400 });

    // Fetch current recall.json
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) return NextResponse.json({ error: 'no github token' }, { status: 500 });

    const apiBase = 'https://api.github.com/repos/Manitec-HQ/Manitec-Dashboard/contents/meta/recall.json';
    const headers = {
      Authorization: `token ${ghToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    };

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

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
