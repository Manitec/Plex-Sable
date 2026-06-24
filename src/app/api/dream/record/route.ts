import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, project, timestamp, tone, valence, arousal, whisper, mode } = body;

    if (!tone || valence === undefined || arousal === undefined || !whisper) {
      return NextResponse.json({ error: 'tone, valence, arousal, and whisper are required' }, { status: 400 });
    }

    // Calculate depth — how many times this tone has appeared in this session
    let depth = 1;
    try {
      const q = query(
        collection(db, 'dream_nodes'),
        where('sessionId', '==', sessionId ?? 'default'),
        where('tone', '==', tone)
      );
      const snap = await getDocs(q);
      depth = snap.size + 1;
    } catch {
      depth = 1;
    }

    const node = {
      id: uuidv4(),
      sessionId: sessionId ?? 'default',
      project: project ?? 'plex',
      timestamp: timestamp ?? Date.now(),
      tone,
      valence: Math.max(-1, Math.min(1, Number(valence))),
      arousal: Math.max(0, Math.min(1, Number(arousal))),
      whisper: String(whisper).slice(0, 500),
      mode: mode ?? 'unknown',
      depth,
      createdAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, 'dream_nodes'), node);

    return NextResponse.json({ ok: true, id: ref.id, depth });
  } catch (err: any) {
    console.error('dream/record error:', err?.message);
    return NextResponse.json({ error: 'Failed to record dream node', detail: err?.message }, { status: 500 });
  }
}
