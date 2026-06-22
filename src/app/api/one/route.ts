import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';

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
      const snap = await getDocs(query(collection(db, 'one_requests'), orderBy('createdAt', 'desc'), limit(10)));
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

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
