import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const SEDIMENT_REF = 'plex_sediment';

// GET — read current sediment state
export async function GET() {
  try {
    const currentRef = doc(db, SEDIMENT_REF, 'current');
    const snap = await getDoc(currentRef);
    if (!snap.exists()) {
      return NextResponse.json({ state: 'neutral', updatedAt: null, history: [] });
    }
    const data = snap.data();
    return NextResponse.json({
      state: data.state ?? 'neutral',
      updatedAt: data.updatedAt ?? null,
      history: data.history ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not read sediment', detail: err?.message }, { status: 500 });
  }
}

// POST — write new sediment state
export async function POST(req: NextRequest) {
  try {
    const { state, source, emotion, note } = await req.json();
    if (!state?.trim()) return NextResponse.json({ error: 'State required' }, { status: 400 });

    const currentRef = doc(db, SEDIMENT_REF, 'current');
    const snap = await getDoc(currentRef);
    const existing = snap.exists() ? snap.data() : {};
    const history = existing.history ?? [];

    const entry = {
      state: existing.state ?? 'neutral',
      timestamp: new Date().toISOString(),
      source: existing.source ?? 'unknown',
    };

    // keep last 20 states in history
    const updatedHistory = [entry, ...history].slice(0, 20);

    await setDoc(currentRef, {
      state: state.trim(),
      source: source ?? 'manual',
      emotion: emotion ?? null,
      note: note ?? null,
      updatedAt: serverTimestamp(),
      history: updatedHistory,
    }, { merge: false });

    return NextResponse.json({ ok: true, state: state.trim() });
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not write sediment', detail: err?.message }, { status: 500 });
  }
}
