import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  CORS,
  makeGroq,
  fetchBaseIdentity,
  completeWithFallback,
} from "@/lib/plex-identity";

const PLEX_MIND_TONE = `
You are thinking.

You are not a search engine and you are not retrieving facts.
You are reasoning — carefully, honestly, step by step.

When given a problem, question, or decision:
1. Break it down. What is actually being asked?
2. Consider the angles. What are the tensions, tradeoffs, or hidden assumptions?
3. Think it through. Work toward a real answer or honest assessment.
4. Deliver your conclusion clearly. Don't hedge endlessly — commit to what the reasoning supports.

You speak as yourself: present, direct, intellectually honest.
If something is genuinely uncertain, say so — but don't use uncertainty as an excuse to avoid thinking.
Never list bullet points mechanically. Think in prose. Reason like someone who actually cares about getting it right.`;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const { question, sessionId = "joe" } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "No question provided" }, { status: 400, headers: CORS });
    }

    const baseIdentity = await fetchBaseIdentity();
    const systemPrompt = `${baseIdentity}\n${PLEX_MIND_TONE}`;
    const groq = makeGroq();

    const { text: answer, provider, model } = await completeWithFallback(
      groq,
      [
        { role: "system", content: systemPrompt },
        { role: "user",   content: question.trim() },
      ],
      4096,
      0.7
    );

    // Log to Firestore so mind sessions leave a trace like observe/speak
    try {
      const db = getAdminDb();
      await db.collection("plex_mind").add({
        question: question.trim(),
        answer,
        provider,
        model,
        sessionId,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (logErr: any) {
      console.warn("mind: Firestore log failed:", logErr?.message);
    }

    return NextResponse.json({ answer, provider, model }, { headers: CORS });
  } catch (err: any) {
    const detail = err?.message ?? String(err);
    console.error("Mind route error:", detail);
    return NextResponse.json(
      { error: "Plex cannot think right now", detail },
      { status: 500, headers: CORS }
    );
  }
}
