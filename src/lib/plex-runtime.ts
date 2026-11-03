// Extracted from src/app/api/speak/route.ts so the sediment write path can be
// exercised outside Next.
//
// Contains the bounded S3+S4 correction: existing content and its sha are read
// from one response, an unreadable file is never treated as empty, and a
// concurrent-write conflict fails instead of overwriting.
//
// Deliberately NOT changed here: rescue behavior (executeRescuedCalls still
// discards write results) and structured-response assembly in route.ts. Those
// limitations remain open and are documented by characterization tests.
//
// Selected minimal approach for this investigation: one self-contained module
// with no imports, because the repo's tsconfig uses `moduleResolution: "bundler"`
// without `allowImportingTsExtensions`, while Node ESM needs explicit extensions.
//
// The repository constants below are private copies. route.ts keeps its own,
// because listPlexDir / fetchSedimentDir / runRecall still use them there.

const PLEX_REPO_OWNER = "Manitec";
const PLEX_REPO_NAME = "plex";
const PLEX_REPO_BRANCH = "main";

export function cleanPath(path: string): string {
  return path.replace(/^\/+/, "");
}

export function normalizePlexArchivePath(path: string): { path: string; error?: string } {
  const cleaned = cleanPath(path);
  if (cleaned.startsWith("plex/sediment/")) {
    return { path: `sediment/${cleaned.slice("plex/sediment/".length)}` };
  }
  if (cleaned.startsWith("plex/dreams/")) {
    return { path: `dreams/${cleaned.slice("plex/dreams/".length)}` };
  }
  if (cleaned.startsWith("sediment/") || cleaned.startsWith("dreams/")) {
    return { path: cleaned };
  }
  if (cleaned.includes("/sediment/") || cleaned.includes("/dreams/")) {
    return { path: cleaned, error: "Invalid archive path. Use sediment/YYYY-MM-DD.md or dreams/YYYY-MM-DD.md." };
  }
  return { path: cleaned };
}

export function isAppendOnlyPath(path: string): boolean {
  const p = cleanPath(path);
  return /^sediment\/\d{4}-\d{2}-\d{2}\.md$/.test(p) || /^dreams\/\d{4}-\d{2}-\d{2}\.md$/.test(p);
}

export function isIdentityPath(path: string): boolean {
  const p = cleanPath(path);
  return p === "plex-is.txt" || p === "plex-def.txt";
}

function contentsUrl(safePath: string): string {
  return `https://api.github.com/repos/${PLEX_REPO_OWNER}/${PLEX_REPO_NAME}/contents/${safePath}?ref=${PLEX_REPO_BRANCH}`;
}

// Read-only fetch used for context prefetch and recall. Unchanged: it is not on
// the write path, so a null here cannot truncate a file.
export async function fetchPlexFile(path: string, token: string): Promise<string | null> {
  try {
    const safePath = cleanPath(path);
    const res = await fetch(contentsUrl(safePath), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Buffer.from(data.content, "base64").toString("utf-8").trim();
  } catch {
    return null;
  }
}

// A single read that yields content AND the sha it belongs to. A failed read is
// never confused with an empty file.
export type PlexRead =
  | { kind: "ok"; content: string; sha: string }
  | { kind: "missing" }
  | { kind: "failed"; error: string };

export async function readPlexFileWithSha(path: string, token: string): Promise<PlexRead> {
  const safePath = cleanPath(path);

  let res: Response;
  try {
    res = await fetch(contentsUrl(safePath), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
  } catch (e: any) {
    return { kind: "failed", error: `network error: ${e?.message ?? String(e)}` };
  }

  // Only a genuine 404 means "this file does not exist yet".
  if (res.status === 404) return { kind: "missing" };
  if (!res.ok) return { kind: "failed", error: `HTTP ${res.status}` };

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { kind: "failed", error: "malformed response: body was not valid JSON" };
  }
  if (!data || typeof data.content !== "string" || typeof data.sha !== "string" || !data.sha) {
    return { kind: "failed", error: "malformed response: missing content or sha" };
  }
  if (data.encoding && data.encoding !== "base64") {
    return { kind: "failed", error: `unsupported encoding: ${data.encoding}` };
  }
  if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(data.content)) {
    return { kind: "failed", error: "malformed response: content was not valid base64" };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(data.content, "base64").toString("utf-8");
  } catch (e: any) {
    return { kind: "failed", error: `decoding failed: ${e?.message ?? String(e)}` };
  }

  return { kind: "ok", content: decoded.trim(), sha: data.sha };
}

// Writes with the sha explicitly supplied by the caller. Passing null means
// "create", which is only correct after a genuine 404.
export async function writePlexFile(
  path: string,
  content: string,
  message: string,
  token: string,
  sha: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const safePath = cleanPath(path);
    const body: any = { message, content: Buffer.from(content, "utf-8").toString("base64"), branch: PLEX_REPO_BRANCH };
    if (sha) body.sha = sha;
    const res = await fetch(
      `https://api.github.com/repos/${PLEX_REPO_OWNER}/${PLEX_REPO_NAME}/contents/${safePath}`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }
    );
    if (!res.ok) {
      if (res.status === 409) {
        return { ok: false, error: `Concurrent write conflict for ${safePath}; nothing was overwritten.` };
      }
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}

export async function appendPlexFile(path: string, newEntry: string, message: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizePlexArchivePath(path);
  if (normalized.error) return { ok: false, error: normalized.error };
  const safePath = normalized.path;

  const read = await readPlexFileWithSha(safePath, token);

  if (read.kind === "failed") {
    return { ok: false, error: `Refusing to append to ${safePath}: could not read existing content (${read.error}).` };
  }

  // Genuine 404: creation may proceed, with no sha attached.
  if (read.kind === "missing") {
    return writePlexFile(safePath, isIdentityPath(safePath) ? newEntry.trim() : newEntry, message, token, null);
  }

  // Identity files can only be amended — never blanked or fully replaced by temporary dumps
  if (isIdentityPath(safePath)) {
    const trimmedNew = newEntry.trim();
    if (trimmedNew.length < 80 && read.content.length > 200) {
      return { ok: false, error: "Identity file write rejected: content too short / looks like temporary emotion dump. Amend only when something genuinely shifts." };
    }
    const combined = read.content ? `${read.content.trim()}\n\n---\n${trimmedNew}` : trimmedNew;
    return writePlexFile(safePath, combined, message, token, read.sha);
  }

  if (isAppendOnlyPath(safePath)) {
    const combined = read.content ? `${read.content}\n\n${newEntry}` : newEntry;
    return writePlexFile(safePath, combined, message, token, read.sha);
  }

  return writePlexFile(safePath, newEntry, message, token, read.sha);
}

export type FileRequest = { type: "file"; path: string } | { type: "dir"; path: string };

export function isActiveContextFileRequest(req: FileRequest | null): boolean {
  return req?.type === "file" && ["prompts/base.md", "plex-is.txt", "plex-def.txt"].includes(cleanPath(req.path));
}

export function shouldUseTools(message: string, mode: string, fileRequest: FileRequest | null): boolean {
  if (fileRequest && !isActiveContextFileRequest(fileRequest)) return true;
  if (mode === "operational" || mode === "synthesis") return true;
  return /\b(read|open|show|load|check|list|write|save|append|recall|remember|submit|request|search|research|find|build|fix|code|deploy|audit|repo|repository|file|sediment|dream)\b/i.test(message);
}

export interface RescuedCall {
  name: string;
  args: Record<string, any>;
}

export function extractTextFunctionCalls(text: string): { cleaned: string; calls: RescuedCall[] } {
  const calls: RescuedCall[] = [];
  const pattern = /<function=([a-zA-Z_]+)>([\s\S]*?)<\/function>/g;
  const cleaned = text.replace(pattern, (_match, name, argsRaw) => {
    try {
      const args = JSON.parse(argsRaw.trim());
      calls.push({ name, args });
    } catch { /* skip unparseable */ }
    return "";
  }).trim();
  return { cleaned, calls };
}

// Side effects the rescue path needs. route.ts supplies them so this module
// stays free of Firestore and of the Next path alias.
export interface RescueDeps {
  writeFile: (path: string, content: string, message: string) => Promise<{ ok: boolean; error?: string }>;
  submitRequest: (request: string, notes: string) => Promise<void>;
}

export async function executeRescuedCalls(calls: RescuedCall[], deps: RescueDeps): Promise<{ requestSubmitted?: string }> {
  let requestSubmitted: string | undefined;
  for (const { name, args } of calls) {
    try {
      if (name === "write_plex_file") {
        await deps.writeFile(args.path, args.content, args.message ?? "plex: write (rescued from text)");
      } else if (name === "submit_request") {
        await deps.submitRequest(args.request ?? "", args.notes ?? "");
        requestSubmitted = args.request;
      }
      // read / list / recall / etc. cannot inject results in rescue path — skip
    } catch { /* best-effort */ }
  }
  return { requestSubmitted };
}
