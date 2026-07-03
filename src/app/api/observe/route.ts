import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { appendSediment } from "@/lib/github";
import {
  CORS, VISION_MODEL,
  makeGroq, buildObservePrompt, isSelfReferential,
  isActionIntent, PLEX_ACTION_PROMPT, PLEX_VISION_TONE,
  fetchBaseIdentity, PLEX_BROWSER_CONTEXT,
  observeWithFallback, completeWithFallback,
} from "@/lib/plex-identity";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ── SYN-E: question detection ────────────────────────────────────────────────
function isQuestion(prompt: string | null): boolean {
  if (!prompt || prompt.trim().length < 8) return false;
  const p = prompt.trim().toLowerCase();
  if (p.endsWith("?")) return true;
  if (/^(what|who|when|where|why|how|which|is|are|was|were|does|do|did|can|could|would|should|has|have)\b/.test(p)) return true;
  return false;
}

/**
 * SYN-E should only fire for factual/external questions about the world.
 * Suppress it when:
 *  - The page is Plex's own sediment, prompts, or anything self-referential
 *  - The prompt is short and personal (opinion, feeling, reaction)
 *  - The prompt contains introspective keywords
 */
function isPersonalOrSelfReferential(prompt: string | null, selfRef: boolean): boolean {
  if (selfRef) return true;
  if (!prompt) return false;
  const p = prompt.trim().toLowerCase();
  // Short prompts asking for her opinion/feeling are always personal
  if (p.length < 40 && /\b(opinion|feel|think|react|sense|notice|see in this|mean to you|your take|how does|what do you)\b/.test(p)) return true;
  if (/\b(can you feel|do you feel|what do you think|what does this mean|your thoughts|your reaction|your opinion)\b/.test(p)) return true;
  return false;
}

// ── SYN-E ───────────────────────────────────────────────────────────────────────
async function runSynE(question: string, pageContext: string, baseUrl: string): Promise<string> {
  try {
    const srcRes = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question, maxResults: 5 }),
    });
    const srcData = srcRes.ok ? await srcRes.json() : null;
    const searchResults: string = srcData?.results
      ? srcData.results.slice(0, 5)
          .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.snippet ?? ""}\n${r.url ?? ""}`)
          .join("\n\n")
      : "(no search results)";
    const synRes = await fetch(`${baseUrl}/api/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, searchResults, pageContext, source: "electron" }),
    });
    const synData = synRes.ok ? await synRes.json() : null;
    return synData?.answer ?? "(no answer)";
  } catch (e: any) {
    console.error("runSynE failed:", e?.message);
    return "(search failed)";
  }
}

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

// ── GitHub helpers ─────────────────────────────────────────────────────────────
function isGitHubPage(url: string | null): boolean {
  return !!(url && url.includes('github.com/'));
}

function isGitHubBlob(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/blob\//.test(url);
}

function filterElementsForGitHub(elements: object[]): object[] {
  return elements.filter((el: any) => {
    const tag  = (el.tag  ?? '').toLowerCase();
    const role = (el.role ?? '').toLowerCase();
    if (tag === 'a') return false;
    if (tag === 'input' || tag === 'textarea' || tag === 'button') return true;
    if (role === 'button' || role === 'textbox' || role === 'searchbox') return true;
    return false;
  });
}

function buildGitHubHint(url: string, pageText: string | null): string {
  if (isGitHubBlob(url)) {
    return `\n\nGITHUB PAGE TYPE: FILE (blob). This is a file view — do NOT navigate deeper. Use action { "action": "read" } to read the file content from the page.`;
  }
  if (!pageText) return '';
  const ghMatch = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/(tree)\/([^/]+))?(\/.*)?\//);
  if (!ghMatch) return '';
  const owner    = ghMatch[1];
  const repo     = ghMatch[2];
  const branch   = ghMatch[4] ?? 'main';
  const basePath = (ghMatch[5] ?? '').replace(/^\//, '');
  const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
  const fileNames = lines.filter(l =>
    /^[\w.-]+$/.test(l) && l.length < 80 && l !== owner && l !== repo && l !== branch
  ).slice(0, 20);
  if (!fileNames.length) return '';
  const examples = fileNames.slice(0, 8).map(name => {
    const isFile = name.includes('.');
    const path   = basePath ? `${basePath}/${name}` : name;
    const type   = isFile ? 'blob' : 'tree';
    return `  ${name} → https://github.com/${owner}/${repo}/${type}/${branch}/${path}`;
  }).join('\n');
  return `\n\nGITHUB PAGE TYPE: FOLDER (tree). Use navigate actions with these exact URLs:\n${examples}\nConstruct: https://github.com/${owner}/${repo}/blob|tree/${branch}/${basePath ? basePath + '/' : ''}<filename>`;
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
    let interactiveElements: object[] = [];
    let editorInfo: { editorType?: string; editorSelector?: string } = {};

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
         interactiveElements = [], editorInfo = {} } = body);
    }

    // ── GitHub: strip anchor elements, inject navigate/read hints ──────────────────
    const onGitHub = isGitHubPage(url);
    if (onGitHub) {
      interactiveElements = filterElementsForGitHub(interactiveElements);
    }

    const hasImage  = !!(imageUrl || imageFile);
    const fromPE    = source === "plex-electron";
    const hasEditor = !!(editorInfo?.editorType);
    const canAct    = fromPE || interactiveElements.length > 0;

    // Detect self-referential early so we can use it in shouldSearch
    const selfRef = isSelfReferential(url ?? "", title ?? "", pageText ?? "");

    // SYN-E fires only for genuine external factual questions.
    // Suppress on self-referential pages (sediment, prompts, Manitec repos)
    // and for short personal/introspective prompts.
    const shouldSearch = fromPE
      && isQuestion(prompt)
      && !selfRef
      && !isPersonalOrSelfReferential(prompt, selfRef);

    if (!hasImage && !url) {
      return NextResponse.json({ error: "url or image required" }, { status: 400, headers: CORS });
    }

    const baseIdentity = await fetchBaseIdentity();
    const groq = makeGroq();
    let response  = "";
    let actions: object[] = [];
    let synEAnswer: string | null = null;

    // ── SYN-E ──────────────────────────────────────────────────────────────────
    let synEPromise: Promise<string> | null = null;
    if (shouldSearch && prompt) {
      const pageContext = [
        title    ? `Page: ${title}` : "",
        url      ? `URL: ${url}` : "",
        pageText ? `Page excerpt:\n${pageText.slice(0, 800)}` : "",
      ].filter(Boolean).join("\n");
      synEPromise = runSynE(prompt, pageContext, getBaseUrl(req));
    }

    // ── VISION PATH ────────────────────────────────────────────────────────────
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
      try {
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
      } catch (err: any) {
        const msg = String(err?.message ?? "");
        const isQuota = err?.status === 429 || msg.includes("rate_limit") || msg.includes("TPD") || msg.includes("quota");
        if (isQuota) {
          response = "I'm at my vision limit right now — Groq's daily token cap. Try again in about an hour.";
          console.warn('[vision] Groq quota — graceful fallback message');
        } else { throw err; }
      }

    // ── ACTION PATH ────────────────────────────────────────────────────────────
    } else if (canAct && isActionIntent(prompt, { fromPE, hasEditor })) {
      const editorBlock = editorInfo?.editorType
        ? `\n\nEDITOR INFO (probed live from the DOM):\n${JSON.stringify(editorInfo, null, 2)}`
        : "";
      const elementsBlock = interactiveElements.length
        ? `\n\nINTERACTIVE ELEMENTS (scraped live from the DOM — ONLY use selectors from this list):\n${JSON.stringify(interactiveElements, null, 2)}`
        : "\n\n(No interactive elements — use navigate or read actions only.)";
      const ghHint = onGitHub ? buildGitHubHint(url!, pageText) : '';
      const pageContext = [
        title    ? `Page title: ${title}` : "",
        url      ? `URL: ${url}` : "",
        pageText ? `Page text (excerpt):\n${pageText.slice(0, 2000)}` : "",
      ].filter(Boolean).join("\n");
      const userMessage = `Joe's instruction: ${prompt}${editorBlock}${elementsBlock}${ghHint}\n\nPage context:\n${pageContext}`;
      const { text: raw } = await completeWithFallback(
        groq,
        [
          { role: "system", content: PLEX_ACTION_PROMPT },
          { role: "user",   content: userMessage },
        ],
        1024,
        0.3
      );
      try {
        const parsed = JSON.parse(raw);
        response = parsed.response ?? "I'll take care of that.";
        actions  = Array.isArray(parsed.actions) ? parsed.actions : [];
      } catch {
        response = raw.slice(0, 300);
        actions  = [];
      }

    // ── OBSERVE PATH ───────────────────────────────────────────────────────────
    } else {
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
          400
        );
      }
    }

    // ── Resolve SYN-E ───────────────────────────────────────────────────────────
    if (synEPromise) {
      synEAnswer = await synEPromise;
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

    // ── SEDIMENT ────────────────────────────────────────────────────────────────────
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
