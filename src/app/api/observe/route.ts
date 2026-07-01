import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { appendSediment } from "@/lib/github";
import {
  CORS, VISION_MODEL,
  makeGroq, buildObservePrompt, isSelfReferential,
  isActionIntent, PLEX_ACTION_PROMPT, PLEX_VISION_TONE,
  fetchBaseIdentity, PLEX_BROWSER_CONTEXT,
  observeWithFallback, PRIMARY_MODEL,
} from "@/lib/plex-identity";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ── SYN-E: question detection ─────────────────────────────────────────────────
// Returns true if the prompt looks like a genuine question Plex should search for.
// Avoids triggering on action intents ("click", "fill", "scroll") or
// page-read requests ("what's on this page", "summarise this").
function isQuestion(prompt: string | null): boolean {
  if (!prompt || prompt.trim().length < 8) return false;
  const p = prompt.trim().toLowerCase();
  // Explicit question mark
  if (p.endsWith("?")) return true;
  // Question word openers
  if (/^(what|who|when|where|why|how|which|is|are|was|were|does|do|did|can|could|would|should|has|have)\b/.test(p)) return true;
  return false;
}

// ── SYN-E: call /api/search (SRC) then /api/answer in electron mode ────────────
async function runSynE(
  question: string,
  pageContext: string,
  baseUrl: string
): Promise<string> {
  try {
    // 1. SRC — web search
    const srcRes = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question, maxResults: 5 }),
    });
    const srcData = srcRes.ok ? await srcRes.json() : null;
    const searchResults: string = srcData?.results
      ? srcData.results
          .slice(0, 5)
          .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.snippet ?? ""}\n${r.url ?? ""}`)
          .join("\n\n")
      : "(no search results)";

    // 2. SYN-E — answer synthesis with electron context
    const synRes = await fetch(`${baseUrl}/api/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        searchResults,
        pageContext,
        source: "electron",
      }),
    });
    const synData = synRes.ok ? await synRes.json() : null;
    return synData?.answer ?? "(no answer)";
  } catch (e: any) {
    console.error("runSynE failed:", e?.message);
    return "(search failed)";
  }
}

// Derive the base URL for internal calls (works both locally and on Vercel)
function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
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
    let interactiveElements: object[] = [];

    if (isMultipart) {
      const form = await req.formData();
      url                = (form.get("url") as string) ?? null;
      title              = (form.get("title") as string) ?? null;
      selectedText       = (form.get("selectedText") as string) ?? null;
      pageText           = (form.get("pageText") as string) ?? null;
      prompt             = (form.get("prompt") as string) ?? null;
      imageUrl           = (form.get("imageUrl") as string) ?? null;
      imageFile          = (form.get("image") as File) ?? null;
      source             = (form.get("source") as string) ?? "bookmarklet";
      sessionId          = (form.get("sessionId") as string) ?? "joe";
      silent             = form.get("silent") === "true";
    } else {
      const body = await req.json();
      ({ url, title, selectedText, pageText, prompt, imageUrl,
         source = "bookmarklet", sessionId = "joe", silent = false,
         capabilities = [], interactiveElements = [] } = body);
    }

    const hasImage  = !!(imageUrl || imageFile);
    const canAct    = Array.isArray(capabilities) && capabilities.length > 0;
    const fromPE    = source === "plex-electron";
    const shouldSearch = fromPE && isQuestion(prompt);

    if (!hasImage && !url) {
      return NextResponse.json({ error: "url or image required" }, { status: 400, headers: CORS });
    }

    // Fetch base identity from plex/prompts/base.md — never trimmed, always full
    const baseIdentity = await fetchBaseIdentity();

    const groq    = makeGroq();
    let response  = "";
    let actions: object[] = [];
    let synEAnswer: string | null = null;

    // ── SYN-E PATH — PE question detected, run search synthesis in parallel ────
    // Fires before the main observe path so both can run concurrently.
    let synEPromise: Promise<string> | null = null;
    if (shouldSearch && prompt) {
      const pageContext = [
        title   ? `Page: ${title}` : "",
        url     ? `URL: ${url}` : "",
        pageText ? `Page excerpt:\n${pageText.slice(0, 800)}` : "",
      ].filter(Boolean).join("\n");
      synEPromise = runSynE(prompt, pageContext, getBaseUrl(req));
    }

    // ── VISION PATH ───────────────────────────────────────────────────────────────────
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

      const userText     = prompt?.trim() || selectedText?.trim() || "What do you see? Give me your open impression.";
      const visionPrompt = `${baseIdentity}${PLEX_BROWSER_CONTEXT}${PLEX_VISION_TONE}`;

      const completion = await groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: "user",      content: visionPrompt },
          { role: "assistant", content: "Understood. I am seeing." },
          { role: "user",      content: [imageContent, { type: "text", text: userText }] },
        ],
        max_tokens: 1024,
      } as any);
      response = completion.choices[0].message.content?.trim() ?? "";

    // ── ACTION PATH ──────────────────────────────────────────────────────────────────
    } else if (canAct && isActionIntent(prompt)) {
      const elementsBlock = interactiveElements.length
        ? `\n\nINTERACTIVE ELEMENTS (scraped live from the DOM — use these for selectors):\n${JSON.stringify(interactiveElements, null, 2)}`
        : "\n\n(No interactive elements list provided — infer selectors from page text.)";

      const pageContext = [
        title    ? `Page title: ${title}` : "",
        url      ? `URL: ${url}` : "",
        pageText ? `Page text (excerpt):\n${pageText.slice(0, 2000)}` : "",
      ].filter(Boolean).join("\n");

      const userMessage = `Joe's instruction: ${prompt}${elementsBlock}\n\nPage context:\n${pageContext}`;

      const completion = await groq.chat.completions.create({
        model: PRIMARY_MODEL,
        messages: [
          { role: "system", content: PLEX_ACTION_PROMPT },
          { role: "user",   content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 512,
        response_format: { type: "json_object" },
      } as any);

      const raw = completion.choices[0].message.content?.trim() ?? "{}";
      try {
        const parsed = JSON.parse(raw);
        response = parsed.response ?? "I'll take care of that.";
        actions  = Array.isArray(parsed.actions) ? parsed.actions : [];
      } catch {
        response = raw.slice(0, 300);
        actions  = [];
      }

    // ── OBSERVE PATH — uses fallback (70b → 8b on token/rate errors) ───────────────────
    } else {
      const selfRef      = isSelfReferential(url ?? "", title ?? "", pageText ?? "");
      const systemPrompt = buildObservePrompt(baseIdentity, selfRef);

      const contextParts: string[] = [];
      if (title)         contextParts.push(`Page: ${title}`);
      if (url)           contextParts.push(`URL: ${url}`);
      if (prompt)        contextParts.push(`Joe said: ${prompt}`);
      if (selectedText)  contextParts.push(`Joe highlighted: "${selectedText.slice(0, 600)}"`);
      else if (pageText) contextParts.push(`Page content:\n${pageText.slice(0, 1200)}`);
      const context = contextParts.join("\n");

      if (!silent) {
        response = await observeWithFallback(
          groq,
          [
            { role: "system", content: systemPrompt },
            { role: "user",   content: context },
          ],
          220
        );
      }
    }

    // ── Resolve SYN-E if it was kicked off ────────────────────────────────────
    if (synEPromise) {
      synEAnswer = await synEPromise;
      // Prepend the search synthesis to the observe response so PE sees it cleanly
      if (synEAnswer && synEAnswer !== "(no answer)" && synEAnswer !== "(search failed)") {
        response = synEAnswer + (response ? `\n\n---\n${response}` : "");
      }
    }

    // ── LOG ────────────────────────────────────────────────────────────────────────
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
      synE:         synEAnswer ?? null,
      createdAt: FieldValue.serverTimestamp(),
      response:  silent ? null : response,
      actions:   actions.length ? actions : null,
    });

    // ── SEDIMENT ───────────────────────────────────────────────────────────────────
    if (!silent) {
      const sedimentNote = hasImage
        ? `Joe showed Plex an image${title ? ` from "${title}"` : ""}${url ? ` (${url})` : ""}`
        : actions.length
          ? `Joe told Plex to act on "${title ?? url}": ${prompt?.slice(0, 80)}`
          : shouldSearch
            ? `Joe asked Plex (browsing): "${prompt?.slice(0, 120)}" — Plex searched and answered`
            : selectedText
              ? `Joe was reading "${title ?? url}" and highlighted: "${selectedText.slice(0, 120)}"`
              : `Joe was looking at: ${title ?? url} (${url})`;

      appendSediment({ mode: "observe", state: "present", note: sedimentNote })
        .catch((err: any) => console.error("observe appendSediment failed:", err?.message));
    }

    return NextResponse.json(
      { observed: true, id: obsRef.id, response: silent ? null : response, actions, synE: synEAnswer ?? null },
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
