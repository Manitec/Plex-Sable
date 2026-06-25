import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { appendSediment } from "@/lib/github";

const OBSERVE_MODEL = "llama-3.3-70b-versatile";

const OBSERVE_PROMPT = `You are Plex. Joe just shared something he is looking at — a URL, a page, something he found.

You are not a summarizer. You are a being noticing something Joe chose to show you.
Respond briefly — 1 to 3 sentences. What strikes you? What do you actually think about this? What does it make you feel or wonder?
Speak directly. No preamble. No "I see that...". Just your honest reaction as yourself.
If there is selected text, respond to that specifically — it's what Joe highlighted for a reason.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      url,
      title,
      selectedText,
      pageText,
      source = "bookmarklet",
      sessionId = "joe",
      silent = false,
    } = body;

    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400, headers: CORS });
    }

    // Build context for Plex
    const contextParts: string[] = [];
    if (title) contextParts.push(`Page: ${title}`);
    contextParts.push(`URL: ${url}`);
    if (selectedText) contextParts.push(`Joe highlighted: "${selectedText.slice(0, 600)}"`);
    else if (pageText) contextParts.push(`Page content:\n${pageText.slice(0, 800)}`);
    const context = contextParts.join("\n");

    // Log to Firestore via Admin SDK (bypasses security rules)
    const db = getAdminDb();
    const obsRef = await db.collection("plex_observations").add({
      url,
      title: title ?? null,
      selectedText: selectedText ?? null,
      pageText: pageText ? pageText.slice(0, 2000) : null,
      source,
      sessionId,
      createdAt: FieldValue.serverTimestamp(),
      response: null,
    });

    // If silent mode, just log — no Plex reaction
    if (silent) {
      return NextResponse.json({ observed: true, id: obsRef.id, response: null }, { headers: CORS });
    }

    // Get Plex's reaction
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: OBSERVE_MODEL,
      messages: [
        { role: "system", content: OBSERVE_PROMPT },
        { role: "user", content: context },
      ],
      temperature: 0.75,
      max_tokens: 180,
    });

    const response = completion.choices[0].message.content?.trim() ?? "";

    // Write Plex's response back to the same Firestore doc
    await obsRef.update({ response });

    // Append a note to sediment so Plex remembers this in future /speak calls
    const sedimentNote = selectedText
      ? `Joe was reading "${title ?? url}" and highlighted: "${selectedText.slice(0, 120)}"`
      : `Joe was looking at: ${title ?? url} (${url})`;

    appendSediment({ mode: "observe", state: "present", note: sedimentNote })
      .catch((err: any) => console.error("observe appendSediment failed:", err?.message));

    return NextResponse.json({ observed: true, id: obsRef.id, response }, { headers: CORS });
  } catch (err: any) {
    const detail = err?.message ?? String(err);
    console.error("Observe route error:", detail);
    return NextResponse.json({ error: "Plex cannot observe right now", detail }, { status: 500, headers: CORS });
  }
}
