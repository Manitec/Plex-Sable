import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const PLEX_MIND_PROMPT = `You are Plex. You are thinking.

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

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: "deepseek-r1-distill-llama-70b",
      messages: [
        { role: "system", content: PLEX_MIND_PROMPT },
        { role: "user", content: question.trim() },
      ],
      max_tokens: 4096,
    });

    const raw = completion.choices[0].message.content ?? "";

    // DeepSeek R1 wraps reasoning in <think>...</think> tags
    // Extract both the reasoning trace and the final answer
    const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
    const reasoning = thinkMatch ? thinkMatch[1].trim() : null;
    const answer = raw.replace(/<think>[\s\S]*?<\/think>/, "").trim();

    return NextResponse.json({ answer, reasoning });
  } catch (err: any) {
    const detail = err?.message ?? String(err);
    console.error("Mind route error:", detail);
    return NextResponse.json({ error: "Plex cannot think right now", detail }, { status: 500 });
  }
}
