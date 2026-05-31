import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { query, results } = await req.json();

  const context = results
    .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.content}`)
    .join("\n\n");

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: "You are Kairos. Answer questions clearly and cite your sources using [1], [2], etc.",
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
}