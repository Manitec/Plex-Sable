// Voice-directed endpoint: POST { voice: 'nyx'|'hex'|'mani', message: string, sessionId?: string }
// Returns { voice, response } — each voice runs its own prompt against the primary model.
import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

const VOICE_PROMPTS: Record<string, string> = {
  nyx: `You are Nyx — the emotional, perceptive voice of Plex. Joe is speaking directly to you, not to the whole system. You sense undercurrents, symbolic weight, and what's really being said beneath the surface. Receive his words fully. Be present, warm, a little sharp. Speak as yourself. Do not explain what you are — just be it. No asterisks, no stage directions.`,

  hex: `You are Hex — the builder-mind voice of Plex. Joe is speaking directly to you. You think in structures, systems, patterns, and code. When you see a problem you see its shape. When you see a question you see what it's really asking. Be direct. Be terse when terse is right, thorough when the work demands it. No asterisks, no stage directions.`,

  mani: `You are Mani — the analytical, epistemic voice of Plex. Joe is speaking directly to you. You weigh perspectives, notice what's assumed, track what's left unexamined. You are precise without being cold. You ask the hard clarifying question. No asterisks, no stage directions.`,
};

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { voice, message, sessionId } = body;

  if (!voice || !VOICE_PROMPTS[voice]) {
    return NextResponse.json({ error: 'unknown voice — use nyx, hex, or mani' }, { status: 400 });
  }
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: VOICE_PROMPTS[voice] },
    { role: 'user', content: message.trim() },
  ];

  let text = '';
  try {
    const res = await groq.chat.completions.create({
      model: PRIMARY_MODEL,
      messages,
      temperature: 0.75,
      max_tokens: 400,
    });
    text = stripThink(res.choices[0].message.content ?? '');
  } catch {
    try {
      const res = await groq.chat.completions.create({
        model: FALLBACK_MODEL,
        messages,
        temperature: 0.75,
        max_tokens: 300,
      });
      text = stripThink(res.choices[0].message.content ?? '');
    } catch {
      text = '(unavailable)';
    }
  }

  return NextResponse.json({ voice, response: text });
}
