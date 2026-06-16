import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export async function GET() {
  try {
    const sedimentSnap = await db.doc("plex_sediment/current").get();
    const sediment = sedimentSnap.exists ? sedimentSnap.data()?.state ?? "unknown" : "unknown";

    const autonomySnap = await db.doc("one_governance/autonomy").get();
    const autonomy = autonomySnap.exists ? autonomySnap.data() : { level: 0, label: "supervised", updatedAt: null };

    const eckoSnap = await db.collection("ecko-archive").orderBy("timestamp", "desc").limit(5).get();
    const eckoFragments = eckoSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const requestsSnap = await db.collection("one_requests").orderBy("createdAt", "desc").limit(10).get();
    const requests = requestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const logSnap = await db.collection("one_log").orderBy("timestamp", "desc").limit(10).get();
    const log = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ sediment, autonomy, eckoFragments, requests, log });
  } catch (err: any) {
    console.error("ONE route error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "set_autonomy") {
      const { level, label } = body;
      await db.doc("one_governance/autonomy").set({
        level, label,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "joe",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "add_request") {
      const { request, source, notes } = body;
      await db.collection("one_requests").add({
        request,
        source: source ?? "plex",
        notes: notes ?? null,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "approve_request") {
      const { requestId } = body;
      await db.doc(`one_requests/${requestId}`).set({
        status: "approved",
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "decline_request") {
      const { requestId } = body;
      await db.doc(`one_requests/${requestId}`).set({
        status: "declined",
        reviewedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "add_log") {
      const { entry, author } = body;
      await db.collection("one_log").add({
        entry,
        author: author ?? "joe",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("ONE POST error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
