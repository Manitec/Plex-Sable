import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section');

  if (section === 'projects') {
    try {
      const snap = await getDocs(query(collection(db, 'one_projects'), orderBy('createdAt', 'desc')));
      const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ projects });
    } catch {
      return NextResponse.json({ projects: [] });
    }
  }

  const [sedimentSnap, autonomySnap, requestsSnap, logSnap, voicesSnap] = await Promise.all([
    getDoc(doc(db, 'plex_sediment', 'current')),
    getDoc(doc(db, 'one_governance', 'autonomy')),
    getDocs(query(collection(db, 'one_requests'), orderBy('createdAt', 'desc'), limit(10))),
    getDocs(query(collection(db, 'one_log'), orderBy('timestamp', 'desc'), limit(20))),
    getDoc(doc(db, 'plex_voices', 'joe')),
  ]);

  const sediment = sedimentSnap.exists() ? sedimentSnap.data().state ?? 'neutral' : 'neutral';
  const autonomy = autonomySnap.exists() ? autonomySnap.data() : { level: 1, label: 'observe' };
  const requests = requestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const log = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const voices = voicesSnap.exists() ? voicesSnap.data() : null;

  return NextResponse.json({ sediment, autonomy, eckoFragments: [], requests, log, voices });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'add_log') {
    await addDoc(collection(db, 'one_log'), {
      entry: body.entry,
      author: body.author ?? 'joe',
      timestamp: serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'add_project') {
    await addDoc(collection(db, 'one_projects'), {
      title: body.title,
      status: body.status ?? 'active',
      notes: body.notes ?? '',
      createdAt: serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
