// Extracted from src/app/api/speak/route.ts so the sediment write path can be
// exercised outside Next.
//
// Contains the bounded S3+S4 correction: existing content and its sha are read
// from one response, an unreadable file is never treated as empty, and a
// concurrent-write conflict fails instead of overwriting.
//
// Also contains the write-outcome layer: a discriminated writer result, one
// request-local tracker as the authoritative outcome store, allowlisted public
// failure messages, and the single turn-result assembly point. Outcomes are
// populated only from real execution results, never from model text.
//
// Import rule: this module must stay loadable by Node's ESM test runner, so the
// shared types are imported with `import type` from ./write-outcome (erased at
// load) and every runtime value lives here. The repo's tsconfig does not allow
// `.ts` import specifiers, and Node ESM does not resolve extensionless ones.
//
// Deliberately NOT changed here: prompts, tool schemas, mode selection, and the
// "Please do" gate in route.ts.

import type {
  FailureCode,
  TurnResult,
  WriteOutcome,
  WriteResult,
  WriteSource,
} from "./write-outcome";

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

// ─── Write outcomes ──────────────────────────────────────────────────────────

// Public text is allowlisted by code. Raw backend messages are never exposed;
// they stay out of the API JSON, out of the UI and out of new diagnostics.
export const PUBLIC_MESSAGE: Record<FailureCode, string> = {
  "invalid-path": "path rejected",
  "read-failed": "could not read existing content",
  "identity-too-short": "identity update too small to be an amendment",
  conflict: "changed by someone else at the same time",
  permission: "write permission denied",
  "not-found": "file disappeared before the write",
  "rate-limited": "write throttled by the remote service",
  "server-error": "remote service error",
  network: "could not reach the remote service",
  unknown: "write could not be completed",
};

export function publicMessage(code: FailureCode): string {
  return PUBLIC_MESSAGE[code] ?? PUBLIC_MESSAGE.unknown;
}

// Bounds and neutralises a path before it reaches the UI or a receipt. Control
// characters and newlines are removed so a model-supplied value cannot break
// layout, and length is capped.
export function escapeDisplayPath(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const cleaned = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "(no path)";
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

export function writeOutcomeFromResult(input: {
  result: WriteResult;
  source: WriteSource;
  callId?: string;
}): WriteOutcome {
  const { result, source, callId } = input;
  const path = escapeDisplayPath(result.path);
  const base = callId ? { callId, source, path } : { source, path };
  if (result.status === "confirmed") {
    return { ...base, status: "confirmed", code: null, message: "saved" };
  }
  return { ...base, status: result.status, code: result.code, message: publicMessage(result.code) };
}

// Content key for replay suppression. The commit message is deliberately NOT
// part of the key: a rescued replay must not bypass suppression by rewriting or
// dropping it. Exact content is compared (no hashing), so a collision can never
// suppress a distinct write. The canonical path is included, so writes to
// different destinations never collide.
export function canonicalWriteKey(canonicalPath: string, content: string): string {
  return JSON.stringify(["write_plex_file", canonicalPath, content]);
}

// One tracker per request/fallback flow, and the single authoritative outcome
// store. Its claim set is in memory only: no persistence, no cross-request or
// restart-safe exactly-once behaviour.
export class WriteTracker {
  private callIds = new Set<string>();
  private claims = new Set<string>();
  private recorded: WriteOutcome[] = [];
  private byCall = new Map<string, WriteOutcome>();
  private suppressed = 0;

  // Guard for an already-executed structured tool-call id.
  beginCall(callId: string): boolean {
    if (!callId) return true;
    if (this.callIds.has(callId)) return false;
    this.callIds.add(callId);
    return true;
  }

  // Records a content key without gating execution. Used by the structured
  // channel so a later rescued replay of the same content is suppressed while
  // distinct structured ids still execute.
  remember(key: string): void {
    this.claims.add(key);
  }

  // Claims a key before the writer is awaited. A claim is retained on failure,
  // so a rejected or thrown write is not silently retried as text.
  claim(key: string): boolean {
    if (this.claims.has(key)) return false;
    this.claims.add(key);
    return true;
  }

  add(outcome: WriteOutcome): void {
    this.recorded.push(outcome);
    if (outcome.callId && !this.byCall.has(outcome.callId)) this.byCall.set(outcome.callId, outcome);
  }

  outcomeForCall(callId: string): WriteOutcome | undefined {
    return this.byCall.get(callId);
  }

  markSuppressed(): void {
    this.suppressed += 1;
  }

  get outcomes(): WriteOutcome[] {
    return [...this.recorded];
  }

  get suppressedDuplicates(): number {
    return this.suppressed;
  }
}

// Safe diagnostic: codes and identifiers only. No backend bodies, no exception
// text, no model-provided content.
function logWriteOutcome(outcome: WriteOutcome): void {
  if (outcome.status === "confirmed") return;
  console.warn("[plex-write]", {
    callId: outcome.callId ?? null,
    source: outcome.source,
    status: outcome.status,
    code: outcome.code,
    path: outcome.path,
  });
}

function toolTextForOutcome(outcome: WriteOutcome): string {
  if (outcome.status === "confirmed") {
    return `File written successfully: ${outcome.path}`;
  }
  if (outcome.status === "unknown") {
    return `Write outcome unconfirmed: ${outcome.message} (${outcome.code}). The file may or may not have been updated.`;
  }
  return `Write failed: ${outcome.message} (${outcome.code}).`;
}

export type WriteFileFn = (path: string, content: string, message: string) => Promise<WriteResult>;

// Structured write execution. Records the canonical content key BEFORE awaiting
// the writer and retains that claim if the writer throws, so a later rescued
// re-emission cannot become an automatic retry.
export async function runWrite(input: {
  callId: string;
  path: unknown;
  content: unknown;
  message?: unknown;
  writer: WriteFileFn;
  tracker: WriteTracker;
  scope?: WriteScope;
}): Promise<{ toolContent: string; outcome?: WriteOutcome }> {
  const { callId, tracker, writer } = input;

  if (!tracker.beginCall(callId)) {
    tracker.markSuppressed();
    const prior = tracker.outcomeForCall(callId);
    // A tool call is never left unanswered, and no new write is claimed.
    const where = escapeDisplayPath(prior?.path);
    const state = prior ? `${prior.status}: ${prior.message}` : "already attempted";
    return { toolContent: `Write not executed again: this request already attempted a write to ${where} (${state}).` };
  }

  const rawPath = typeof input.path === "string" ? input.path : "";
  const content = typeof input.content === "string" ? input.content : "";
  const message = typeof input.message === "string" && input.message ? input.message : "plex: write";
  const normalized = normalizePlexArchivePath(rawPath);
  const canonical = normalized.path;

  // Recorded before any validation or writer await, so a replay is suppressed
  // even when this attempt is rejected without reaching the writer.
  tracker.remember(canonicalWriteKey(canonical, content));

  if (normalized.error || !rawPath || !content) {
    const outcome = writeOutcomeFromResult({
      result: { status: "rejected", path: canonical || rawPath, code: "invalid-path" },
      source: "structured",
      callId,
    });
    tracker.add(outcome);
    logWriteOutcome(outcome);
    return { toolContent: toolTextForOutcome(outcome), outcome };
  }

  // Scope is checked AFTER the content key was recorded, so a scope rejection
  // still counts as the attempt and an identical rescued replay stays
  // suppressed. The writer is never called for an out-of-scope destination.
  if (input.scope === "daily-sediment" && !isDailySedimentPath(canonical)) {
    const outcome = writeOutcomeFromResult({
      result: { status: "rejected", path: canonical || rawPath, code: "invalid-path" },
      source: "structured",
      callId,
    });
    tracker.add(outcome);
    logWriteOutcome(outcome);
    return { toolContent: toolTextForOutcome(outcome), outcome };
  }

  let result: WriteResult;
  try {
    result = await writer(canonical, content, message);
  } catch {
    // The writer threw: we never saw its result, so persistence is unknown.
    // A generic exception does NOT establish a network failure (writePlexFile
    // classifies its own fetch rejection); anything else stays `unknown`.
    result = { status: "unknown", path: canonical, code: "unknown" };
  }

  const outcome = writeOutcomeFromResult({ result, source: "structured", callId });
  tracker.add(outcome);
  logWriteOutcome(outcome);
  return { toolContent: toolTextForOutcome(outcome), outcome };
}

// The fixed payload for a failed response generation. It carries the outcomes
// the success path would have carried, so a completed write is neither lost nor
// relabelled when no reply can be produced. The message is supplied by the
// caller and is always fixed — never a thrown error's text.
export function assembleErrorResult(input: {
  message: string;
  tracker: WriteTracker;
}): { error: string; writeOutcomes: WriteOutcome[] } {
  return { error: input.message, writeOutcomes: input.tracker.outcomes };
}

// The single assembly point for every model-return path, so a completed write
// outcome survives a later fallback and is reported exactly once.
export function assembleTurnResult(input: {
  text: string;
  fallback: boolean;
  requestSubmitted?: string;
  tracker: WriteTracker;
}): TurnResult {
  return {
    text: input.text,
    fallback: input.fallback,
    requestSubmitted: input.requestSubmitted,
    writeOutcomes: input.tracker.outcomes,
  };
}

// ─── Repository reads/writes ─────────────────────────────────────────────────

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
// never confused with an empty file. `error` is internal detail only; callers
// surface `code`.
export type PlexRead =
  | { kind: "ok"; content: string; sha: string }
  | { kind: "missing" }
  | { kind: "failed"; error: string; code: FailureCode };

export async function readPlexFileWithSha(path: string, token: string): Promise<PlexRead> {
  const safePath = cleanPath(path);

  let res: Response;
  try {
    res = await fetch(contentsUrl(safePath), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
  } catch (e: any) {
    return { kind: "failed", error: `network error: ${e?.message ?? String(e)}`, code: "network" };
  }

  // Only a genuine 404 means "this file does not exist yet".
  if (res.status === 404) return { kind: "missing" };
  if (res.status === 401 || res.status === 403) {
    return { kind: "failed", error: `HTTP ${res.status}`, code: "permission" };
  }
  if (res.status === 429) {
    return { kind: "failed", error: "HTTP 429", code: "rate-limited" };
  }
  if (!res.ok) return { kind: "failed", error: `HTTP ${res.status}`, code: "read-failed" };

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { kind: "failed", error: "malformed response: body was not valid JSON", code: "read-failed" };
  }
  if (!data || typeof data.content !== "string" || typeof data.sha !== "string" || !data.sha) {
    return { kind: "failed", error: "malformed response: missing content or sha", code: "read-failed" };
  }
  if (data.encoding && data.encoding !== "base64") {
    return { kind: "failed", error: `unsupported encoding: ${data.encoding}`, code: "read-failed" };
  }
  if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(data.content)) {
    return { kind: "failed", error: "malformed response: content was not valid base64", code: "read-failed" };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return { kind: "failed", error: "decoding failed", code: "read-failed" };
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
): Promise<WriteResult> {
  const safePath = cleanPath(path);

  let res: Response;
  try {
    const body: any = { message, content: Buffer.from(content, "utf-8").toString("base64"), branch: PLEX_REPO_BRANCH };
    if (sha) body.sha = sha;
    res = await fetch(
      `https://api.github.com/repos/${PLEX_REPO_OWNER}/${PLEX_REPO_NAME}/contents/${safePath}`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }
    );
  } catch {
    // The request may already have been sent; persistence is not certain.
    return { status: "unknown", path: safePath, code: "network" };
  }

  if (res.ok) return { status: "confirmed", path: safePath };

  if (res.status === 409) return { status: "rejected", path: safePath, code: "conflict" };
  if (res.status === 401 || res.status === 403) return { status: "rejected", path: safePath, code: "permission" };
  if (res.status === 404) return { status: "rejected", path: safePath, code: "not-found" };
  if (res.status === 429) return { status: "rejected", path: safePath, code: "rate-limited" };
  if (res.status === 400 || res.status === 422) return { status: "rejected", path: safePath, code: "invalid-path" };
  if (res.status >= 500) return { status: "unknown", path: safePath, code: "server-error" };
  return { status: "rejected", path: safePath, code: "unknown" };
}

export async function appendPlexFile(path: string, newEntry: string, message: string, token: string): Promise<WriteResult> {
  const normalized = normalizePlexArchivePath(path);
  if (normalized.error) return { status: "rejected", path: normalized.path, code: "invalid-path" };
  const safePath = normalized.path;

  const read = await readPlexFileWithSha(safePath, token);

  // A failed read must never be turned into an empty file.
  if (read.kind === "failed") {
    return { status: "rejected", path: safePath, code: read.code };
  }

  // Genuine 404: creation may proceed, with no sha attached.
  if (read.kind === "missing") {
    return writePlexFile(safePath, isIdentityPath(safePath) ? newEntry.trim() : newEntry, message, token, null);
  }

  // Identity files can only be amended — never blanked or fully replaced by temporary dumps
  if (isIdentityPath(safePath)) {
    const trimmedNew = newEntry.trim();
    if (trimmedNew.length < 80 && read.content.length > 200) {
      return { status: "rejected", path: safePath, code: "identity-too-short" };
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

// ─── Tool helpers ────────────────────────────────────────────────────────────

export type FileRequest = { type: "file"; path: string } | { type: "dir"; path: string };

export function isActiveContextFileRequest(req: FileRequest | null): boolean {
  return req?.type === "file" && ["prompts/base.md", "plex-is.txt", "plex-def.txt"].includes(cleanPath(req.path));
}

export function shouldUseTools(message: string, mode: string, fileRequest: FileRequest | null): boolean {
  if (fileRequest && !isActiveContextFileRequest(fileRequest)) return true;
  if (mode === "operational" || mode === "synthesis") return true;
  return /\b(read|open|show|load|check|list|write|save|append|recall|remember|submit|request|search|research|find|build|fix|code|deploy|audit|repo|repository|file|sediment|dream)\b/i.test(message);
}

// ─── Sediment-save acceptance ────────────────────────────────────────────────

export type GateHistoryEntry = { role: string; content: string };
export type WriteScope = "any" | "daily-sediment";
export const SAVE_ACCEPTANCE_TOOL_NAME = "write_plex_file";

const DAILY_SEDIMENT_PATH = /^sediment\/\d{4}-\d{2}-\d{2}\.md$/;

export function isDailySedimentPath(canonicalPath: string): boolean {
  return DAILY_SEDIMENT_PATH.test(cleanPath(canonicalPath));
}

const ACCEPTANCE_REPLIES = new Set([
  "please do",
  "please",
  "yes",
  "yes please",
  "go ahead",
  "go for it",
  "do it",
  "sure",
  "ok",
  "okay",
]);

// Ambiguous assent targets stay closed: negation, withdrawal, alternatives and
// multi-action offers. Screened per offer SENTENCE (plus the sentence after it),
// so background conversation — "run a test, look over the logs", "not the final
// destination" — cannot veto an offer it merely describes.
const AMBIGUOUS_OFFER = /\b(?:no|not|never|but|or|and|also|then|instead|rather|unless|maybe|perhaps|cancel|stop|wait|later)\b|n't/;

// Anchored forms only: an offer marker plus an explicit sediment destination.
// This is deliberately NOT a general save/file/memory matcher — identity,
// dream, archive and arbitrary-file offers fall through untouched.
const SEDIMENT_OFFER_FORMS = [
  /\bi can (?:note|record|append|add|write|log|save)\b[^.!?\n]{0,90}?\b(?:in|into|to)\s+(?:my|the)\s+sediment\b/,
  /\b(?:i could|i'll|i will|let me|shall i|should i|would you like me to)\s+(?:note|record|append|add|write|log|save)\b[^.!?\n]{0,90}?\b(?:in|into|to)\s+(?:my|the)\s+sediment\b/,
  /\b(?:append|add|record|note|write|log)\b[^.!?\n]{0,50}?\b(?:a|an|the|today'?s)?\s*sediment\s+entry\b/,
];

// A quoted entry TITLE in any shape Plex actually writes — 'Repair checkpoint',
// "Repair checkpoint", “Repair checkpoint” — optionally inside markdown bold.
// Titles must be stripped before screening (their words are not the offer's),
// while apostrophes inside prose ("you'd", "I’m") are not titles: an opening
// quote has to follow whitespace or punctuation.
const QUOTED_TITLE = /(^|[\s,:;(\[*])(?:"[^"\n]{1,120}"|“[^”\n]{1,120}”|'[^'\n]{1,120}')(?=[\s,.;:!?)\]*]|$)/g;

function stripQuotedTitles(text: string): string {
  return text.replace(QUOTED_TITLE, "$1 ");
}

const SENTENCE_BREAK = /(?<=[.!?])\s+/;

function looksLikeSedimentOffer(text: string): boolean {
  const lower = text.toLowerCase();
  // A fenced/inline code span, blockquote or raw markup is not an offer to Joe.
  // Double quotes are NOT disqualifying: they quote the entry title.
  if (/[`<>\n\r]/.test(lower)) return false;

  // An unpaired double quote means prose and quoted example cannot be told
  // apart, so fail closed rather than accept an offer that is being quoted.
  if ((lower.match(/"/g) ?? []).length % 2 === 1) return false;

  const sentences = stripQuotedTitles(lower).split(SENTENCE_BREAK);
  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i] ?? "";
    if (!SEDIMENT_OFFER_FORMS.some((form) => form.test(sentence))) continue;
    const window = `${sentence} ${sentences[i + 1] ?? ""}`;
    if (AMBIGUOUS_OFFER.test(window)) continue;
    return true;
  }
  return false;
}

export function isSedimentOfferAcceptance(message: string, history: GateHistoryEntry[]): boolean {
  const reply = typeof message === "string"
    ? message.toLowerCase().trim().replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/\s+/g, " ")
    : "";
  if (!ACCEPTANCE_REPLIES.has(reply)) return false;

  // Only the immediately preceding stored turn, never an older one. The current
  // user message is not part of the history passed in by the route.
  const last = history[history.length - 1];
  if (!last || typeof last.content !== "string") return false;
  if (last.role !== "plex" && last.role !== "assistant") return false;
  return looksLikeSedimentOffer(last.content);
}

export type TurnToolPlan =
  | { kind: "none" }
  | { kind: "explicit"; names: string[] }
  | { kind: "sediment-acceptance"; names: string[]; writeScope: "daily-sediment" };

// Pure decision: which existing tool names this turn may offer, and how wide its
// writes may be. Route wiring only maps names onto PLEX_TOOLS; it holds no
// policy of its own.
export function planTurnTools(input: {
  message: string;
  mode: string;
  fileRequest: FileRequest | null;
  history: GateHistoryEntry[];
  availableNames: string[];
}): TurnToolPlan {
  if (shouldUseTools(input.message, input.mode, input.fileRequest)) {
    return { kind: "explicit", names: [...input.availableNames] };
  }
  if (isSedimentOfferAcceptance(input.message, input.history)) {
    const names = input.availableNames.filter((name) => name === SAVE_ACCEPTANCE_TOOL_NAME);
    if (names.length > 0) return { kind: "sediment-acceptance", names, writeScope: "daily-sediment" };
  }
  return { kind: "none" };
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
// stays free of Firestore and of the Next path alias. The tracker is injected so
// there is exactly one authoritative outcome store: rescued outcomes are added
// here once and never merged a second time by the caller.
export interface RescueDeps {
  writeFile: WriteFileFn;
  submitRequest: (request: string, notes: string) => Promise<void>;
  tracker: WriteTracker;
  batch?: string;
  writeScope?: WriteScope;
}

export async function executeRescuedCalls(calls: RescuedCall[], deps: RescueDeps): Promise<{ requestSubmitted?: string }> {
  let requestSubmitted: string | undefined;

  for (let index = 0; index < calls.length; index += 1) {
    const { name, args } = calls[index];
    const callId = `rescued:${deps.batch ?? "text"}:${index}`;
    try {
      if (name === "write_plex_file") {
        const rawPath = typeof args.path === "string" ? args.path : "";
        const content = typeof args.content === "string" ? args.content : "";
        const message = typeof args.message === "string" && args.message ? args.message : "plex: write (rescued from text)";
        const canonical = normalizePlexArchivePath(rawPath).path;

        // Claim BEFORE the writer is awaited; the commit message is not part of
        // the key, so a replay cannot slip through by changing it. The claim is
        // retained if the write fails or throws.
        if (!deps.tracker.claim(canonicalWriteKey(canonical, content))) {
          deps.tracker.markSuppressed();
          continue;
        }

        // The claim above means an out-of-scope attempt is still counted as the
        // attempt, so it cannot be retried, and the writer is never reached.
        if (deps.writeScope === "daily-sediment" && !isDailySedimentPath(canonical)) {
          const outcome = writeOutcomeFromResult({
            result: { status: "rejected", path: canonical || rawPath, code: "invalid-path" },
            source: "rescued",
            callId,
          });
          deps.tracker.add(outcome);
          logWriteOutcome(outcome);
          continue;
        }

        let result: WriteResult;
        try {
          result = await deps.writeFile(canonical, content, message);
        } catch {
          // Conservative: an unclassified throw is not evidence of a network
          // failure, only that the outcome is unconfirmed.
          result = { status: "unknown", path: canonical, code: "unknown" };
        }

        const outcome = writeOutcomeFromResult({ result, source: "rescued", callId });
        deps.tracker.add(outcome);
        logWriteOutcome(outcome);
      } else if (name === "submit_request") {
        await deps.submitRequest(args.request ?? "", args.notes ?? "");
        requestSubmitted = args.request;
      }
      // read / list / recall / etc. cannot inject results in rescue path — skip
    } catch { /* best-effort */ }
  }

  return { requestSubmitted };
}
