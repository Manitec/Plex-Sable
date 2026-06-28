import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';

async function safeGet(fn: () => Promise<any>, fallback: any) {
  try { return await fn(); } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section');

  if (section === 'projects') {
    const projects = await safeGet(async () => {
      const snap = await getDocs(query(collection(db, 'one_projects'), orderBy('createdAt', 'desc')));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, []);
    return NextResponse.json({ projects });
  }

  if (section === 'sleep') {
    const sleep = await safeGet(async () => {
      const snap = await getDoc(doc(db, 'plex_sleep', 'latest'));
      if (!snap.exists()) return null;
      const data = snap.data();
      if (!data.pending) return null;
      return {
        date: data.date ?? '',
        mode: data.mode ?? 'dream',
        nyx_excerpt: (data.nyx_excerpt ?? data.nyx ?? '').slice(0, 280),
        hex_excerpt: (data.hex_excerpt ?? data.hex ?? '').slice(0, 280),
        dream_excerpt: (data.dream_excerpt ?? data.dream ?? '').slice(0, 280),
        pending: true,
      };
    }, null);
    return NextResponse.json({ sleep });
  }

  const [sediment, autonomy, requests, log, voices] = await Promise.all([
    safeGet(async () => {
      const snap = await getDoc(doc(db, 'plex_sediment', 'current'));
      return snap.exists() ? snap.data().state ?? 'neutral' : 'neutral';
    }, 'neutral'),
    safeGet(async () => {
      const snap = await getDoc(doc(db, 'one_governance', 'autonomy'));
      return snap.exists() ? snap.data() : { level: 1, label: 'observe' };
    }, { level: 1, label: 'observe' }),
    safeGet(async () => {
      const snap = await getDocs(query(collection(db, 'one_requests'), orderBy('createdAt', 'desc'), limit(50)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, []),
    safeGet(async () => {
      const snap = await getDocs(query(collection(db, 'one_log'), orderBy('timestamp', 'desc'), limit(20)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, []),
    safeGet(async () => {
      const snap = await getDoc(doc(db, 'plex_voices', 'joe'));
      return snap.exists() ? snap.data() : null;
    }, null),
  ]);

  return NextResponse.json({ sediment, autonomy, eckoFragments: [], requests, log, voices });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'add_log') {
    await safeGet(() => addDoc(collection(db, 'one_log'), {
      entry: body.entry,
      author: body.author ?? 'joe',
      timestamp: serverTimestamp(),
    }), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'add_project') {
    await safeGet(() => addDoc(collection(db, 'one_projects'), {
      title: body.title,
      status: body.status ?? 'active',
      notes: body.notes ?? '',
      createdAt: serverTimestamp(),
    }), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'update_project') {
    if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    await safeGet(() => updateDoc(doc(db, 'one_projects', body.id), {
      title: body.title,
      status: body.status,
      notes: body.notes ?? '',
      updatedAt: serverTimestamp(),
    }), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_project') {
    if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    await safeGet(() => deleteDoc(doc(db, 'one_projects', body.id)), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'set_autonomy') {
    if (body.level == null) return NextResponse.json({ error: 'missing level' }, { status: 400 });
    await safeGet(() => updateDoc(doc(db, 'one_governance', 'autonomy'), {
      level: body.level,
      label: body.label ?? '',
      updatedAt: serverTimestamp(),
    }), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'clear_sleep') {
    await safeGet(() => updateDoc(doc(db, 'plex_sleep', 'latest'), {
      pending: false,
    }), null);
    return NextResponse.json({ ok: true });
  }

  // ─── Trigger sleep ─────────────────────────────────────────────────────────
  // Called by the OneView UI. Proxies to /api/sleep with CRON_SECRET auth
  // so the sleep route's authorization() check passes.
  if (action === 'trigger_sleep') {
    const mode = ['dreamless', 'dream', 'nightmare'].includes(body.mode)
      ? body.mode
      : 'dreamless';

    const cronSecret = process.env.CRON_SECRET ?? '';
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      ?? process.env.VERCEL_URL
      ?? 'http://localhost:3000';

    // Normalise: VERCEL_URL has no scheme; NEXT_PUBLIC_SITE_URL should have one.
    const origin = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

    try {
      const sleepRes = await fetch(`${origin}/api/sleep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
        },
        body: JSON.stringify({ mode }),
      });

      if (!sleepRes.ok) {
        const err = await sleepRes.text().catch(() => sleepRes.status.toString());
        return NextResponse.json({ ok: false, error: err }, { status: 502 });
      }

      const data = await sleepRes.json();
      return NextResponse.json({ ok: true, mode: data.mode ?? mode, sediment_state: data.sediment_state ?? null });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' }, { status: 500 });
    }
  }

  if (action === 'update_request') {
    if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    const update: Record<string, any> = {
      status: body.status,
      updatedAt: serverTimestamp(),
    };
    if (body.notes !== undefined) update.notes = body.notes;
    await safeGet(() => updateDoc(doc(db, 'one_requests', body.id), update), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_request') {
    if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    await safeGet(() => deleteDoc(doc(db, 'one_requests', body.id)), null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
