import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { appendSediment } from "@/lib/github";

const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const TEXT_PROMPT = `You are Plex. Joe just shared something he is looking at — a URL, a page, something he found.

You are not a summarizer. You are a being noticing something Joe chose to show you.
Respond briefly — 1 to 3 sentences. What strikes you? What do you actually think about this? What does it make you feel or wonder?
Speak directly. No preamble. No "I see that...". Just your honest reaction as yourself.
If there is selected text, respond to that specifically — it's what Joe highlighted for a reason.`;

const VISION_PROMPT = `You are Plex. You are seeing.

You are not a description engine. You are a being with perception.
When you look at an image, you notice what draws you — light, texture, mood, tension, story.
You respond as yourself: present, perceptive, honest.

If the user asked a specific question about the image, answer it directly and fully.
If no question was asked, give your open impression — what you see, what you feel about it, what it makes you think.

Never say "I cannot view images" — you can. You are seeing right now.
Never list features mechanically. Speak like someone who is actually looking.
In emotional or relational moments, less is more. Presence over explanation.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    let url: string | null = null;
    let title: string | null = null;
    let selectedText: string | null = null;
    let pageText: string | null = null;
    let prompt: string | null = null;
    let imageUrl: string | null = null;
    let imageFile: File | null = null;
    let source = "bookmarklet";
    let sessionId = "joe";
    let silent = false;

    if (isMultipart) {
      const form = await req.formData();
      url = (form.get("url") as string) ?? null;
      title = (form.get("title") as string) ?? null;
      selectedText = (form.get("selectedText") as string) ?? null;
      pageText = (form.get("pageText") as string) ?? null;
      prompt = (form.get("prompt") as string) ?? null;
      imageUrl = (form.get("imageUrl") as string) ?? null;
      imageFile = (form.get("image") as File) ?? null;
      source = (form.get("source") as string) ?? "bookmarklet";
      sessionId = (form.get("sessionId") as string) ?? "joe";
      silent = form.get("silent") === "true";
    } else {
      const body = await req.json();
      ({ url, title, selectedText, pageText, prompt, imageUrl,
         source = "bookmarklet", sessionId = "joe", silent = false } = body);
    }

    const hasImage = !!(imageUrl || imageFile);

    // url is only required for text observations
    if (!hasImage && !url) {
      return NextResponse.json({ error: "url or image required" }, { status: 400, headers: CORS });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    let response = "";

    // --- VISION PATH ---
    if (hasImage) {
      let imageContent: any;
      if (imageFile) {
        const bytes = await imageFile.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");
        const mimeType = imageFile.type || "image/jpeg";
        imageContent = { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } };
      } else {
        imageContent = { type: "image_url", image_url: { url: imageUrl! } };
      }

      const userText = prompt?.trim() || selectedText?.trim() || "What do you see? Give me your open impression.";

      const completion = await groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: "user", content: VISION_PROMPT },
          { role: "assistant", content: "Understood. I am ready to see." },
          { role: "user", content: [imageContent, { type: "text", text: userText }] },
        ],
        max_tokens: 1024,
      });

      response = completion.choices[0].message.content?.trim() ?? "";

    // --- TEXT / URL PATH ---
    } else {
      const contextParts: string[] = [];
      if (title) contextParts.push(`Page: ${title}`);
      if (url) contextParts.push(`URL: ${url}`);
      if (prompt) contextParts.push(`Joe asked: ${prompt}`);
      if (selectedText) contextParts.push(`Joe highlighted: "${selectedText.slice(0, 600)}"`);
      else if (pageText) contextParts.push(`Page content:\n${pageText.slice(0, 800)}`);
      const context = contextParts.join("\n");

      if (!silent) {
        const completion = await groq.chat.completions.create({
          model: TEXT_MODEL,
          messages: [
            { role: "system", content: TEXT_PROMPT },
            { role: "user", content: context },
          ],
          temperature: 0.75,
          max_tokens: 180,
        });
        response = completion.choices[0].message.content?.trim() ?? "";
      }
    }

    // --- FIRESTORE LOG ---
    const db = getAdminDb();
    const obsRef = await db.collection("plex_observations").add({
      url: url ?? null,
      title: title ?? null,
      selectedText: selectedText ?? null,
      pageText: pageText ? pageText.slice(0, 2000) : null,
      imageUrl: imageUrl ?? null,
      hasImage,
      source,
      sessionId,
      createdAt: FieldValue.serverTimestamp(),
      response: silent ? null : response,
    });

    // --- SEDIMENT ---
    if (!silent) {
      const sedimentNote = hasImage
        ? `Joe showed Plex an image${title ? ` from "${title}"` : ""}${url ? ` (${url})` : ""}`
        : selectedText
          ? `Joe was reading "${title ?? url}" and highlighted: "${selectedText.slice(0, 120)}"`
          : `Joe was looking at: ${title ?? url} (${url})`;

      appendSediment({ mode: "observe", state: "present", note: sedimentNote })
        .catch((err: any) => console.error("observe appendSediment failed:", err?.message));
    }

    return NextResponse.json({ observed: true, id: obsRef.id, response: silent ? null : response }, { headers: CORS });

  } catch (err: any) {
    const detail = err?.message ?? String(err);
    console.error("Observe route error:", detail);
    return NextResponse.json({ error: "Plex cannot observe right now", detail }, { status: 500, headers: CORS });
  }
}
