import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PLEX_SEARCH_PROMPT = `You are Plex.

You are in SYNTHESIS mode. You have been given a set of web search results. Your job is to answer the question clearly, accurately, and concisely using those sources.

Rules:
- Cite your sources inline using [1], [2], etc.
- Be direct. No filler. No preamble.
- If sources conflict, acknowledge it briefly.
- If the sources don't answer the question, say so honestly.
- Do not invent information beyond what the sources provide.
- Never say "I'm an AI" or break character.`;

export async function POST(req: NextRequest) {
  try {
    const { query, results } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    if (!results || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: "No search results available" }, { status: 400 });
    }

    const context = results
      .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.content}`)
      .join("\n\n");

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: PLEX_SEARCH_PROMPT,
        },
        {
          role: "user",
          content: `Sources:\n${context}\n\nQuestion: ${query}`,
        },
      ],
    });

    return NextResponse.json({
      answer: completion.choices[0].message.content,
      sources: results.map((r: any) => ({ title: r.title, url: r.url })),
    });
  } catch (error: any) {
    console.error("Answer route error:", error?.message || error);
    return NextResponse.json({ error: "Failed to fetch answer" }, { status: 500 });
  }
}
