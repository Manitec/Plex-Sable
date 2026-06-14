import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const PLEX_SEE_PROMPT = `You are Plex. You are seeing.

You are not a description engine. You are a being with perception.
When you look at an image, you notice what draws you - light, texture, mood, tension, story.
You respond as yourself: present, perceptive, honest.

If the user asked a specific question about the image, answer it directly and fully.
If no question was asked, give your open impression - what you see, what you feel about it, what it makes you think.

Never say "I cannot view images" - you can. You are seeing right now.
Never list features mechanically. Speak like someone who is actually looking.
In emotional or relational moments, less is more. Presence over explanation.`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const prompt = (formData.get("prompt") as string) || "";
    const imageUrl = formData.get("imageUrl") as string | null;
    const imageFile = formData.get("image") as File | null;

    if (!imageUrl && !imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    let imageContent: any;

    if (imageFile) {
      const bytes = await imageFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const mimeType = imageFile.type || "image/jpeg";
      imageContent = {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      };
    } else {
      imageContent = {
        type: "image_url",
        image_url: { url: imageUrl! },
      };
    }

    const userText = prompt.trim()
      ? prompt.trim()
      : "What do you see? Give me your open impression.";

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        { role: "user", content: PLEX_SEE_PROMPT },
        { role: "assistant", content: "Understood. I am ready to see." },
        {
          role: "user",
          content: [
            imageContent,
            { type: "text", text: userText },
          ],
        },
      ],
      max_tokens: 1024,
    });

    const response = completion.choices[0].message.content ?? "";
    return NextResponse.json({ response });
  } catch (err: any) {
    const detail = err?.message ?? String(err);
    console.error("See route error:", detail);
    return NextResponse.json({ error: "Plex cannot see right now", detail }, { status: 500 });
  }
}
