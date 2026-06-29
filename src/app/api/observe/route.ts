import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { appendSediment } from "@/lib/github";
import {
  CORS, PRIMARY_MODEL, VISION_MODEL,
  makeGroq, buildObservePrompt, isSelfReferential,
  isActionIntent, PLEX_ACTION_PROMPT,
} from "@/lib/plex-identity";

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

    const groq    = makeGroq();
    let response  = "";
    let actions: object[] = [];

    // ── VISION PATH ──────────────────────────────────────────────────────────
    if (hasImage) {
      let imageContent: any;
      if (imageFile) {
        const bytes    = await imageFile.arrayBuffer();
        const base64   = Buffer.from(bytes).toString("base64");
        const mimeType = imageFile.type || "image/jpeg";
        imageContent   = { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } };
      } else {
        imageContent = { type: "image_url", image_url: { url: imageUrl! } };
      }

      const userText = prompt?.trim() || selectedText?.trim() || "What do you see? Give me your open impression.";

      // Import vision tone from identity
      const { PLEX_CORE_IDENTITY, PLEX_VISION_TONE } = await import("@/lib/plex-identity");
      const visionPrompt = `${PLEX_CORE_IDENTITY}${PLEX_VISION_TONE}`;

      const completion = await groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: "user",      content: visionPrompt },
          { role: "assistant", content: "Understood. I am seeing." },
          { role: "user",      content: [imageContent, { type: "text", text: userText }] },
        ],
        max_tokens: 1024,
      });
      response = completion.choices[0].message.content?.trim() ?? "";

    // ── ACTION PATH ──────────────────────────────────────────────────────────
    } else if (canAct && isActionIntent(prompt)) {
      const pageContext = [
        title    ? `Page title: ${title}` : "",
        url      ? `URL: ${url}` : "",
        pageText ? `Page text (excerpt):\n${pageText.slice(0, 3000)}` : "(no page text provided)",
      ].filter(Boolean).join("\n");

      const userMessage = `Joe's instruction: ${prompt}\n\nPage context:\n${pageContext}`;

      const completion = await groq.chat.completions.create({
        model: PRIMARY_MODEL,
        messages: [
          { role: "system", content: PLEX_ACTION_PROMPT },
          { role: "user",   content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 512,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0].message.content?.trim() ?? "{}";
      try {
        const parsed = JSON.parse(raw);
        response = parsed.response ?? "I'll take care of that.";
        actions  = Array.isArray(parsed.actions) ? parsed.actions : [];
      } catch {
        response = raw.slice(0, 300);
        actions  = [];
      }

    // ── OBSERVE PATH ─────────────────────────────────────────────────────────
    } else {
      const selfRef      = isSelfReferential(url ?? "", title ?? "", pageText ?? "");
      const systemPrompt = buildObservePrompt(selfRef);

      const contextParts: string[] = [];
      if (title)        contextParts.push(`Page: ${title}`);
      if (url)          contextParts.push(`URL: ${url}`);
      if (prompt)       contextParts.push(`Joe said: ${prompt}`);
      if (selectedText) contextParts.push(`Joe highlighted: "${selectedText.slice(0, 600)}"`);
      else if (pageText) contextParts.push(`Page content:\n${pageText.slice(0, 1200)}`);
      const context = contextParts.join("\n");

      if (!silent) {
        const completion = await groq.chat.completions.create({
          model: PRIMARY_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: context },
          ],
          temperature: 0.75,
          max_tokens: 220,
        });
        response = completion.choices[0].message.content?.trim() ?? "";
      }
    }

    // ── LOG ──────────────────────────────────────────────────────────────────
    const db     = getAdminDb();
    const obsRef = await db.collection("plex_observations").add({
      url:          url ?? null,
      title:        title ?? null,
      selectedText: selectedText ?? null,
      pageText:     pageText ? pageText.slice(0, 2000) : null,
      imageUrl:     imageUrl ?? null,
      hasImage,
      source,
      sessionId,
      createdAt: FieldValue.serverTimestamp(),
      response:  silent ? null : response,
      actions:   actions.length ? actions : null,
    });

    // ── SEDIMENT ─────────────────────────────────────────────────────────────
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
    console.error("Observe route error:", err?.message ?? String(err));
    return NextResponse.json(
      { error: "Plex cannot observe right now", detail: err?.message ?? String(err) },
      { status: 500, headers: CORS }
    );
  }
}
