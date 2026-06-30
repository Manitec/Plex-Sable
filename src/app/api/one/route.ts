import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

async function safeGet(fn: () => Promise<any>, fallback: any) {
  try { return await fn(); } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section');
  const db = getAdminDb();

  if (section === 'projects') {
    const projects = await safeGet(async () => {
      const snap = await db.collection('one_projects').orderBy('createdAt', 'desc').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, []);
    return NextResponse.json({ projects });
  }

  if (section === 'sleep') {
    const sleep = await safeGet(async () => {
      const snap = await db.doc('plex_sleep/latest').get();
      if (!snap.exists) return null;
      const data = snap.data()!;
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
      const snap = await db.doc('plex_sediment/current').get();
      return snap.exists ? snap.data()?.state ?? 'neutral' : 'neutral';
    }, 'neutral'),
    safeGet(async () => {
      const snap = await db.doc('one_governance/autonomy').get();
      return snap.exists ? snap.data() : { level: 1, label: 'observe' };
    }, { level: 1, label: 'observe' }),
    safeGet(async () => {
      const snap = await db.collection('one_requests').orderBy('createdAt', 'desc').limit(50).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, []),
    safeGet(async () => {
      const snap = await db.collection('one_log').orderBy('timestamp', 'desc').limit(20).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }, []),
    safeGet(async () => {
      const snap = await db.doc('plex_voices/joe').get();
      return snap.exists ? snap.data() : null;
    }, null),
  ]);

  return NextResponse.json({ sediment, autonomy, eckoFragments: [], requests, log, voices });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  const db = getAdminDb();

  if (action === 'add_log') {
    await safeGet(() => db.collection('one_log').add({
      entry: body.entry,
      author: body.author ?? 'joe',
      timestamp: FieldValue.serverTimestamp(),
    }), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'add_project') {
    await safeGet(() => db.collection('one_projects').add({
      title: body.title,
      status: body.status ?? 'active',
      notes: body.notes ?? '',
      createdAt: FieldValue.serverTimestamp(),
    }), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'update_project') {
    if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    await safeGet(() => db.doc(`one_projects/${body.id}`).update({
      title: body.title,
      status: body.status,
      notes: body.notes ?? '',
      updatedAt: FieldValue.serverTimestamp(),
    }), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_project') {
    if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    await safeGet(() => db.doc(`one_projects/${body.id}`).delete(), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'set_autonomy') {
    if (body.level == null) return NextResponse.json({ error: 'missing level' }, { status: 400 });
    // Use set({merge:true}) so this creates the doc if one_governance/autonomy was never seeded
    await safeGet(() => db.doc('one_governance/autonomy').set({
      level: body.level,
      label: body.label ?? '',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'clear_sleep') {
    await safeGet(() => db.doc('plex_sleep/latest').update({
      pending: false,
    }), null);
    return NextResponse.json({ ok: true });
  }

  // ─── Trigger sleep ─────────────────────────────────────────────────────────
  if (action === 'trigger_sleep') {
    const mode = ['dreamless', 'dream', 'nightmare'].includes(body.mode)
      ? body.mode
      : 'dreamless';

    const cronSecret = process.env.CRON_SECRET ?? '';
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      ?? process.env.VERCEL_URL
      ?? 'http://localhost:3000';

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
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (body.notes !== undefined) update.notes = body.notes;
    await safeGet(() => db.doc(`one_requests/${body.id}`).update(update), null);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_request') {
    if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    await safeGet(() => db.doc(`one_requests/${body.id}`).delete(), null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
