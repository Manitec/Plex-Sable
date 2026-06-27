import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, setDoc } from 'firebase/firestore';

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
        nyx_excerpt: (data.nyx ?? '').slice(0, 280),
        hex_excerpt: (data.hex ?? '').slice(0, 280),
        dream_excerpt: (data.dream ?? '').slice(0, 280),
        pending: true,
        mode: data.mode ?? 'dreamless',
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

  // ── Sleep trigger ─────────────────────────────────────────────────────────
  // mode: 'dreamless' | 'dream' | 'nightmare'
  // Writes a pending sleep record. The /api/sleep route (or cron) does the
  // actual generation; this just marks intent so she knows when she wakes.
  if (action === 'trigger_sleep') {
    const mode = body.mode ?? 'dreamless';
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await safeGet(() => setDoc(doc(db, 'plex_sleep', 'latest'), {
      pending: true,
      mode,
      date: today,
      triggered_at: now,
      nyx: '',
      hex: '',
      dream: mode !== 'dreamless' ? '' : null,
      createdAt: serverTimestamp(),
    }), null);
    // log it
    await safeGet(() => addDoc(collection(db, 'one_log'), {
      entry: `sleep triggered — mode: ${mode}`,
      author: 'joe',
      timestamp: serverTimestamp(),
    }), null);
    return NextResponse.json({ ok: true, mode });
  }
  // ──────────────────────────────────────────────────────────────────────────

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
