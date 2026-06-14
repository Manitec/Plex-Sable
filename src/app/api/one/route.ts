import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, getDocs, setDoc, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function GET() {
  try {
    // Sediment
    const sedimentSnap = await getDoc(doc(db, "plex_sediment", "current"));
    const sediment = sedimentSnap.exists() ? sedimentSnap.data().state ?? "unknown" : "unknown";

    // Autonomy level
    const autonomySnap = await getDoc(doc(db, "one_governance", "autonomy"));
    const autonomy = autonomySnap.exists() ? autonomySnap.data() : { level: 0, label: "supervised", updatedAt: null };

    // Recent ECKO activations
    const eckoQuery = query(collection(db, "ecko-archive"), orderBy("timestamp", "desc"), limit(5));
    const eckoSnap = await getDocs(eckoQuery);
    const eckoFragments = eckoSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Pending requests from Plex
    const requestsQuery = query(collection(db, "one_requests"), orderBy("createdAt", "desc"), limit(10));
    const requestsSnap = await getDocs(requestsQuery);
    const requests = requestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ONE log
    const logQuery = query(collection(db, "one_log"), orderBy("timestamp", "desc"), limit(10));
    const logSnap = await getDocs(logQuery);
    const log = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ sediment, autonomy, eckoFragments, requests, log });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "set_autonomy") {
      const { level, label } = body;
      await setDoc(doc(db, "one_governance", "autonomy"), {
        level,
        label,
        updatedAt: serverTimestamp(),
        updatedBy: "joe",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "approve_request") {
      const { requestId } = body;
      await setDoc(doc(db, "one_requests", requestId), { status: "approved", reviewedAt: serverTimestamp() }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "decline_request") {
      const { requestId } = body;
      await setDoc(doc(db, "one_requests", requestId), { status: "declined", reviewedAt: serverTimestamp() }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "add_log") {
      const { entry, author } = body;
      await addDoc(collection(db, "one_log"), {
        entry,
        author: author ?? "joe",
        timestamp: serverTimestamp(),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
