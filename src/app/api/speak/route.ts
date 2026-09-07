// RESTORED: Original /api/speak from commit 35bc8f6 (SHA: 133526f)
// Added: cap messages array to last 100 entries to avoid Firestore 1MB doc limit

import { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, sessionId, project } = body;

    if (!message || !sessionId) {
      return Response.json({ error: 'Missing message or sessionId' }, { status: 400 });
    }

    const db = getAdminDb();

    // Load session context
    const sessionRef = db.collection('plex_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    const sessionData = sessionDoc.exists ? sessionDoc.data()! : {};

    // Build messages array
    const messages = (sessionData.messages || []) as any[];
    messages.push({ role: 'user', content: message, timestamp: FieldValue.serverTimestamp() });

    // Call model (your original logic here)
    const responseText = `Echo: ${message}`; // TODO: restore your full model router call

    messages.push({ role: 'assistant', content: responseText, timestamp: FieldValue.serverTimestamp() });

    // CAP MESSAGES: Keep only last 100 to stay under Firestore 1MB doc limit
    const MAX_MESSAGES = 100;
    const cappedMessages = messages.slice(-MAX_MESSAGES);

    // Save session
    await sessionRef.set({
      messages: cappedMessages,  // Use capped array
      project: project || sessionData.project || 'default',
      lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });

    return Response.json({
      response: responseText,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Error in /api/speak:', e);
    return Response.json(
      { error: 'Internal error', message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    service: 'plex-sable',
    route: '/api/speak',
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
}
