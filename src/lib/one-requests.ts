// Request-queue service for the `/api/one` request actions.
//
// This module owns the *decisions* for reading, updating and deleting ONE
// requests so the behaviour can be exercised with injected storage. The route
// handler is a thin adapter over these functions.
//
// Invariants kept here:
//   - a failed queue read is never reported as an empty queue;
//   - a failed update/delete never reports success;
//   - `status` is validated against the vocabulary the UI already uses;
//   - a missing document is reported explicitly instead of being inferred from
//     Firestore's own error text;
//   - a request id must be a single document id, so a caller cannot turn
//     `one_requests/<id>` into a nested Firestore path.

export const REQUEST_STATUSES = [
  'pending',
  'acknowledged',
  'in-progress',
  'done',
  'deferred',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const QUEUE_LIMIT = 50;

export function isRequestStatus(value: unknown): value is RequestStatus {
  return (
    typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

export function describeSupportedStatuses(): string {
  return REQUEST_STATUSES.join(', ');
}

export interface RequestRecord {
  id: string;
  [field: string]: unknown;
}

/** Minimal storage surface the request actions need. */
export interface RequestStorage {
  /** Most recent requests, newest first. Must reject on read failure. */
  listRecent(limit: number): Promise<RequestRecord[]>;
  /** Whether the document currently exists. Must reject on backend failure. */
  exists(id: string): Promise<boolean>;
  /** Apply a status/notes update. Must reject on failure. */
  update(id: string, patch: { status: RequestStatus; notes?: string }): Promise<void>;
  /** Remove the document. Must reject on failure. */
  remove(id: string): Promise<void>;
}

export interface QueueReadResult {
  requests: RequestRecord[];
  requestsError?: string;
}

export interface ActionOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

/**
 * Read the queue without ever throwing.
 *
 * Success with no documents yields `{ requests: [] }`.
 * A read failure yields `{ requests: [], requestsError: 'unavailable' }` so the
 * caller can tell "empty" apart from "could not read".
 */
export async function readQueue(storage: RequestStorage): Promise<QueueReadResult> {
  try {
    const requests = await storage.listRecent(QUEUE_LIMIT);
    return { requests };
  } catch {
    return { requests: [], requestsError: 'unavailable' };
  }
}

/** Firestore caps document ids at 1500 bytes. */
export const MAX_REQUEST_ID_LENGTH = 1500;

/**
 * A request id has to name one document under `one_requests`.
 *
 * Path separators are rejected rather than sanitised: an id like `a/b` would
 * otherwise address `one_requests/a/b`, letting the caller choose a nested
 * path outside the collection the action is supposed to touch.
 */
export function isValidRequestId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const id = value.trim();
  if (!id || id.length > MAX_REQUEST_ID_LENGTH) return false;
  if (id === '.' || id === '..') return false;
  return !id.includes('/') && !id.includes('\\');
}

type IdResult = { ok: true; id: string } | { ok: false; error: string };

function readId(body: Record<string, unknown>): IdResult {
  if (typeof body.id !== 'string' || !body.id.trim()) {
    return { ok: false, error: 'missing id' };
  }
  const id = body.id.trim();
  if (!isValidRequestId(id)) {
    return { ok: false, error: 'invalid request id' };
  }
  return { ok: true, id };
}

export async function updateRequest(
  storage: RequestStorage,
  body: Record<string, unknown>,
): Promise<ActionOutcome> {
  const parsed = readId(body);
  if (!parsed.ok) {
    return { httpStatus: 400, body: { ok: false, error: parsed.error } };
  }
  const id = parsed.id;

  if (!isRequestStatus(body.status)) {
    return {
      httpStatus: 400,
      body: {
        ok: false,
        error: `unsupported status; expected one of: ${describeSupportedStatuses()}`,
      },
    };
  }

  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return { httpStatus: 400, body: { ok: false, error: 'notes must be a string' } };
  }

  const patch: { status: RequestStatus; notes?: string } = { status: body.status };
  if (typeof body.notes === 'string') patch.notes = body.notes;

  try {
    if (!(await storage.exists(id))) {
      return {
        httpStatus: 404,
        body: { ok: false, error: 'request not found', id },
      };
    }
    await storage.update(id, patch);
    return { httpStatus: 200, body: { ok: true } };
  } catch {
    return {
      httpStatus: 500,
      body: { ok: false, error: 'request update failed', id },
    };
  }
}

/**
 * Delete a request.
 *
 * Chosen behaviour for an already-absent document: 404, not success.
 * Firestore's `delete()` is idempotent and resolves even when the document does
 * not exist, so absence is checked explicitly rather than inferred from the
 * delete call. This keeps "deleted something" distinct from "there was nothing
 * to delete", which matters because the request record is the only trace of
 * what Plex asked for.
 */
export async function deleteRequest(
  storage: RequestStorage,
  body: Record<string, unknown>,
): Promise<ActionOutcome> {
  const parsed = readId(body);
  if (!parsed.ok) {
    return { httpStatus: 400, body: { ok: false, error: parsed.error } };
  }
  const id = parsed.id;

  try {
    if (!(await storage.exists(id))) {
      return {
        httpStatus: 404,
        body: { ok: false, error: 'request not found', id },
      };
    }
    await storage.remove(id);
    return { httpStatus: 200, body: { ok: true } };
  } catch {
    return {
      httpStatus: 500,
      body: { ok: false, error: 'request delete failed', id },
    };
  }
}
