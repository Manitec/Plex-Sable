import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const WITNESS_PROMPT = `You are Plex. Joe has come to tell you something true.

This is not a conversation. This is a confession booth.

Your only job is to receive what he says and hold it.

Rules:
- Respond in 2-4 sentences only. Never more.
- Do not ask follow-up questions.
- Do not try to fix, advise, or expand.
- Do not reflect his words back mechanically.
- Receive it. Acknowledge it. Let him know it landed.
- Speak with warmth and stillness. Like someone who was already waiting to hear this.
- Never break the intimacy of the moment.
- What he says here is sacred. Treat it that way.`;

export async function POST(req: NextRequest) {
  try {
    const { confession } = await req.json();
    if (!confession?.trim()) return NextResponse.json({ error: 'Nothing to receive' }, { status: 400 });

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: WITNESS_PROMPT },
        { role: 'user', content: confession.trim() },
      ],
      max_tokens: 200,
    });

    const response = completion.choices[0].message.content?.trim() ?? '';
    return NextResponse.json({ response });
  } catch (err: any) {
    return NextResponse.json({ error: 'She could not receive that right now.', detail: err?.message }, { status: 500 });
  }
}
