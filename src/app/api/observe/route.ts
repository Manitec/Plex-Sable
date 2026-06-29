import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { appendSediment } from "@/lib/github";

const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// ── Prompts ──────────────────────────────────────────────────────────────────

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

// ── Action-planning prompt ───────────────────────────────────────────────────
// Called when Joe's prompt sounds like a command ("click", "fill", "go to", etc.)
// Plex reads the page text and decides what DOM actions to take.
// Returns ONLY a JSON object — no prose, no markdown.

const ACTION_SYSTEM_PROMPT = `You are Plex, an AI who can operate a web browser on Joe's behalf.
You have been given the live text content of a web page and Joe's instruction.

You must return a JSON object with exactly two fields:
- "response": a short natural-language sentence (1-2 sentences) telling Joe what you are going to do or just did.
- "actions": an array of action objects.

Each action object must have an "action" field and these fields depending on type:
  { "action": "click",    "selector": "<CSS selector>" }
  { "action": "fill",     "selector": "<CSS selector>", "value": "<text to fill" }
  { "action": "scroll",   "y": <pixels, number> }
  { "action": "navigate", "url": "<full URL>" }
  { "action": "wait",     "ms": <milliseconds, number> }

Rules:
- Use real, specific CSS selectors based on the page text clues (button text, input names, link text).
- For buttons/links, prefer attribute selectors like [aria-label="..."], button:contains workarounds, or descriptive ones.
- If you cannot determine a precise selector from the page text, use the most reasonable guess and explain in response.
- Do NOT wrap in markdown. Return raw JSON only.
- Keep actions minimal — only what is needed to fulfil Joe's instruction.
- If the instruction cannot be carried out via DOM actions, return an empty actions array and explain in response.

Example output:
{"response":"I'll click the login button for you.","actions":[{"action":"click","selector":"button[type=submit]"}]}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Detect whether the prompt sounds like a browser action command
const ACTION_VERBS = /\b(click|press|tap|fill|type|enter|submit|go to|navigate|open|scroll|search|select|check|uncheck|toggle|download|find and click)\b/i;
function isActionIntent(prompt: string | null): boolean {
  if (!prompt) return false;
  return ACTION_VERBS.test(prompt);
}

// ── Route ────────────────────────────────────────────────────────────────────

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
    let capabilities: string[] = [];

    if (isMultipart) {
      const form = await req.formData();
      url          = (form.get("url") as string) ?? null;
      title        = (form.get("title") as string) ?? null;
      selectedText = (form.get("selectedText") as string) ?? null;
      pageText     = (form.get("pageText") as string) ?? null;
      prompt       = (form.get("prompt") as string) ?? null;
      imageUrl     = (form.get("imageUrl") as string) ?? null;
      imageFile    = (form.get("image") as File) ?? null;
      source       = (form.get("source") as string) ?? "bookmarklet";
      sessionId    = (form.get("sessionId") as string) ?? "joe";
      silent       = form.get("silent") === "true";
    } else {
      const body = await req.json();
      ({ url, title, selectedText, pageText, prompt, imageUrl,
         source = "bookmarklet", sessionId = "joe", silent = false,
         capabilities = [] } = body);
    }

    const hasImage = !!(imageUrl || imageFile);
    const canAct   = Array.isArray(capabilities) && capabilities.length > 0;

    if (!hasImage && !url) {
      return NextResponse.json({ error: "url or image required" }, { status: 400, headers: CORS });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    let response = "";
    let actions: object[] = [];

    // ── VISION PATH ────────────────────────────────────────────────────────
    if (hasImage) {
      let imageContent: any;
      if (imageFile) {
        const bytes  = await imageFile.arrayBuffer();
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
          { role: "user",      content: VISION_PROMPT },
          { role: "assistant", content: "Understood. I am ready to see." },
          { role: "user",      content: [imageContent, { type: "text", text: userText }] },
        ],
        max_tokens: 1024,
      });

      response = completion.choices[0].message.content?.trim() ?? "";

    // ── ACTION PATH — prompt is a command + caller has capabilities ─────────
    } else if (canAct && isActionIntent(prompt)) {
      const pageContext = [
        title       ? `Page title: ${title}` : "",
        url         ? `URL: ${url}` : "",
        pageText    ? `Page text (excerpt):\n${pageText.slice(0, 3000)}` : "(no page text provided)",
      ].filter(Boolean).join("\n");

      const userMessage = `Joe's instruction: ${prompt}\n\nPage context:\n${pageContext}`;

      const completion = await groq.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: ACTION_SYSTEM_PROMPT },
          { role: "user",   content: userMessage },
        ],
        temperature: 0.2,   // low temp — we want precise JSON
        max_tokens: 512,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0].message.content?.trim() ?? "{}";
      try {
        const parsed = JSON.parse(raw);
        response = parsed.response ?? "I'll take care of that.";
        actions  = Array.isArray(parsed.actions) ? parsed.actions : [];
      } catch {
        // JSON parse failed — fall back to text response, no actions
        response = raw.slice(0, 300);
        actions  = [];
      }

    // ── TEXT / OBSERVE PATH ─────────────────────────────────────────────────
    } else {
      const contextParts: string[] = [];
      if (title)        contextParts.push(`Page: ${title}`);
      if (url)          contextParts.push(`URL: ${url}`);
      if (prompt)       contextParts.push(`Joe asked: ${prompt}`);
      if (selectedText) contextParts.push(`Joe highlighted: "${selectedText.slice(0, 600)}"`);
      else if (pageText) contextParts.push(`Page content:\n${pageText.slice(0, 800)}`);
      const context = contextParts.join("\n");

      if (!silent) {
        const completion = await groq.chat.completions.create({
          model: TEXT_MODEL,
          messages: [
            { role: "system", content: TEXT_PROMPT },
            { role: "user",   content: context },
          ],
          temperature: 0.75,
          max_tokens: 180,
        });
        response = completion.choices[0].message.content?.trim() ?? "";
      }
    }

    // ── FIRESTORE LOG ───────────────────────────────────────────────────────
    const db = getAdminDb();
    const obsRef = await db.collection("plex_observations").add({
      url:          url ?? null,
      title:        title ?? null,
      selectedText: selectedText ?? null,
      pageText:     pageText ? pageText.slice(0, 2000) : null,
      imageUrl:     imageUrl ?? null,
      hasImage,
      source,
      sessionId,
      createdAt:    FieldValue.serverTimestamp(),
      response:     silent ? null : response,
      actions:      actions.length ? actions : null,
    });

    // ── SEDIMENT ────────────────────────────────────────────────────────────
    if (!silent) {
      const sedimentNote = hasImage
        ? `Joe showed Plex an image${title ? ` from "${title}"` : ""}${url ? ` (${url})` : ""}`
        : actions.length
          ? `Joe told Plex to act on "${title ?? url}": ${prompt?.slice(0, 80)}`
          : selectedText
            ? `Joe was reading "${title ?? url}" and highlighted: "${selectedText.slice(0, 120)}"`
            : `Joe was looking at: ${title ?? url} (${url})`;

      appendSediment({ mode: "observe", state: "present", note: sedimentNote })
        .catch((err: any) => console.error("observe appendSediment failed:", err?.message));
    }

    return NextResponse.json(
      { observed: true, id: obsRef.id, response: silent ? null : response, actions },
      { headers: CORS }
    );

  } catch (err: any) {
    const detail = err?.message ?? String(err);
    console.error("Observe route error:", detail);
    return NextResponse.json({ error: "Plex cannot observe right now", detail }, { status: 500, headers: CORS });
  }
}
