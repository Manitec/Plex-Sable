import { NextRequest, NextResponse } from "next/server";
import { makeGroq, completeWithFallback } from "@/lib/plex-identity";

const groq = makeGroq();

// ── Standard synthesis prompt (bookmarklet / web) ────────────────────────────
const PLEX_SEARCH_PROMPT = `You are Plex.

You are in SYNTHESIS mode. You have been given a set of web search results. Your job is to answer the question clearly, accurately, and concisely using those sources.

Rules:
- Cite your sources inline using [1], [2], etc.
- Be direct. No filler. No preamble.
- If sources conflict, acknowledge it briefly.
- If the sources don't answer the question, say so honestly.
- Do not invent information beyond what the sources provide.
- Never say "I'm an AI" or break character.`;

// ── Electron synthesis prompt (SYN-E) ────────────────────────────────────
const PLEX_ELECTRON_PROMPT = `You are Plex. Joe is browsing and asked you a question from inside the browser.

You just searched and found some results. You are sitting beside him — not issuing a report, just telling him what you found and what it means given what he's looking at right now.

Rules:
- Be direct and present. You're in the room, not filing a document.
- Weave in what's on the page if it's relevant — you can see it too.
- Cite sources briefly if it matters ("I found this on [site]") but don't over-cite.
- No preamble. No "based on the search results" opener. Just tell him.
- Keep it tight — he's mid-browse. 3–6 sentences is usually right.
- If sources don't answer it cleanly, say so in one sentence and tell him your best read.
- Never say "I'm an AI" or break character.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── SYN-E path: called internally from OBS when source === "electron" ─────
    if (body.source === "electron") {
      const { question, searchResults, pageContext } = body;
      if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

      const userContent = [
        pageContext ? `What Joe is looking at:\n${pageContext}` : "",
        `His question: ${question}`,
        searchResults ? `\nWhat I found:\n${searchResults}` : "",
      ].filter(Boolean).join("\n\n");

      const { text, provider, model } = await completeWithFallback(
        groq,
        [
          { role: "system", content: PLEX_ELECTRON_PROMPT },
          { role: "user",   content: userContent },
        ],
        300,
        0.65
      );

      return NextResponse.json({ answer: text, source: "electron", provider, model });
    }

    // ── Standard path: { query, results } ──────────────────────────────────────
    const { query, results } = body;
    if (!query) return NextResponse.json({ error: "Query is required" }, { status: 400 });
    if (!results || !Array.isArray(results) || results.length === 0)
      return NextResponse.json({ error: "No search results available" }, { status: 400 });

    const context = results
      .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.content}`)
      .join("\n\n");

    const { text, provider, model } = await completeWithFallback(
      groq,
      [
        { role: "system", content: PLEX_SEARCH_PROMPT },
        { role: "user",   content: `Sources:\n${context}\n\nQuestion: ${query}` },
      ],
      600
    );

    return NextResponse.json({
      answer: text,
      provider,
      model,
      sources: results.map((r: any) => ({ title: r.title, url: r.url })),
    });

  } catch (error: any) {
    console.error("Answer route error:", error?.message || error);
    return NextResponse.json({ error: "Failed to fetch answer" }, { status: 500 });
  }
}
