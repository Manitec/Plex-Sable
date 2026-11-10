// Sleep state and sleep-document persistence outcomes.
//
// Mostly observability: the accepted state list, the normalization, the
// completion budget, the prompts, the write payload and the write options are
// unchanged from the sleep route. One behavior change is intentional: malformed
// snapshot data or a non-array (non-null) history is rejected before any write
// and reported as preparation-error, instead of being repaired or written over.
// This module exists so one invocation can report what actually happened,
// instead of collapsing every failure into null and then logging an
// unconditional success line.
//
// "confirmed" means the relevant write promise resolved. "write-unconfirmed"
// means the write did not return confirmation. It is not proof that the
// previous state was untouched, and it never claims a definite failed save.
//
// Messages are fixed strings: no completion text, exception text, document
// contents or backend response bodies cross this boundary.

export type StateOutcomeCode =
  | "confirmed"
  | "empty-completion"
  | "invalid-state"
  | "model-error"
  | "read-error"
  | "preparation-error"
  | "write-unconfirmed";

export type SleepPersistenceOutcomeCode = "confirmed" | "write-unconfirmed";

export type Outcome<Code extends string> = {
  code: Code;
  message: string;
};

export const STATE_OUTCOMES: Record<StateOutcomeCode, string> = {
  confirmed: "state update confirmed",
  "empty-completion": "empty state completion",
  "invalid-state": "completion held no accepted state",
  "model-error": "state model call failed",
  "read-error": "current state could not be read",
  "preparation-error": "state preparation failed before any write",
  "write-unconfirmed": "state write did not confirm",
};

export const SLEEP_PERSISTENCE_OUTCOMES: Record<SleepPersistenceOutcomeCode, string> = {
  confirmed: "sleep result written",
  "write-unconfirmed": "sleep result write did not confirm",
};

// Exact list used by the sleep route before this extraction.
export const VALID_STATES = new Set([
  "warm", "arroused", "tender", "unsettled", "heavy", "curious", "quiet",
  "charged", "open", "withdrawn", "resolute", "grieving", "alive", "horny",
]);

export type StateParseResult =
  | { ok: true; state: string }
  | { ok: false; code: "empty-completion" | "invalid-state" };

// The exact existing rule: lowercase, trim, drop every non a-z character, then
// require membership in VALID_STATES. Prose such as "not warm; unsettled"
// normalizes to an unaccepted word and stays rejected; it is never reinterpreted.
export function parseStateCompletion(raw: string): StateParseResult {
  if (raw.trim() === "") return { ok: false, code: "empty-completion" };
  const state = raw.toLowerCase().trim().replace(/[^a-z]/g, "");
  if (!VALID_STATES.has(state)) return { ok: false, code: "invalid-state" };
  return { ok: true, state };
}

export type SedimentStateDeps = {
  complete: (input: string) => Promise<string>;
  readCurrent: () => Promise<{ exists: boolean; data: Record<string, any> }>;
  writeCurrent: (
    data: Record<string, any>,
    options: { merge: false },
  ) => Promise<unknown>;
  serverTimestamp: () => unknown;
  now?: () => Date;
};

export type SedimentStateResult = {
  state: string | null;
  outcome: Outcome<StateOutcomeCode>;
};

// Mirrors the previous order: completion, validation, read, preparation, write.
// Failures before the write is invoked (model call, parsing, preparation, read)
// issue no write at all. A rejected write is reported as unconfirmed and does
// not establish that the previous state was untouched.
export async function updateSedimentStateWithOutcome(input: {
  nyxOutput: string;
  today: string;
  deps: SedimentStateDeps;
}): Promise<SedimentStateResult> {
  const { deps, today } = input;

  // Input shaping is preparation, not a model call: it must not be reported as
  // a model failure when the completion service was never reached.
  let completionInput: string;
  try {
    completionInput = input.nyxOutput.slice(0, 800);
  } catch {
    return {
      state: null,
      outcome: { code: "preparation-error", message: STATE_OUTCOMES["preparation-error"] },
    };
  }

  let raw: string;
  try {
    raw = await deps.complete(completionInput);
  } catch {
    return {
      state: null,
      outcome: { code: "model-error", message: STATE_OUTCOMES["model-error"] },
    };
  }

  // The parser is expected to return empty/invalid for ordinary rejected prose.
  // An exception here is an unexpected shape, reported as preparation: no read
  // or write has happened yet.
  let parsed: StateParseResult;
  try {
    parsed = parseStateCompletion(raw);
  } catch {
    return {
      state: null,
      outcome: { code: "preparation-error", message: STATE_OUTCOMES["preparation-error"] },
    };
  }
  if (!parsed.ok) {
    return {
      state: null,
      outcome: { code: parsed.code, message: STATE_OUTCOMES[parsed.code] },
    };
  }

  let snap: { exists: boolean; data: Record<string, any> };
  try {
    snap = await deps.readCurrent();
  } catch {
    return {
      state: null,
      outcome: { code: "read-error", message: STATE_OUTCOMES["read-error"] },
    };
  }

  // Payload preparation is guarded separately so an unexpected snapshot shape
  // cannot reject the caller's Promise.all. Malformed history is refused, not
  // repaired, replaced or discarded: this invocation issues no state write.
  let payload: Record<string, any>;
  try {
    const existing = snap.exists ? snap.data : {};
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      throw new TypeError("malformed snapshot");
    }
    const history = existing.history ?? [];
    if (!Array.isArray(history)) throw new TypeError("malformed history");
    const entry = {
      state: existing.state ?? "neutral",
      timestamp: (deps.now ? deps.now() : new Date()).toISOString(),
      source: "sleep",
    };
    payload = {
      ...existing,
      state: parsed.state,
      source: "sleep",
      sessionRef: today,
      note: `Derived from nightly pass — ${today}`,
      updatedAt: deps.serverTimestamp(),
      history: [entry, ...history].slice(0, 20),
    };
  } catch {
    return {
      state: null,
      outcome: { code: "preparation-error", message: STATE_OUTCOMES["preparation-error"] },
    };
  }

  try {
    await deps.writeCurrent(payload, { merge: false });
  } catch {
    return {
      state: null,
      outcome: { code: "write-unconfirmed", message: STATE_OUTCOMES["write-unconfirmed"] },
    };
  }

  return {
    state: parsed.state,
    outcome: { code: "confirmed", message: STATE_OUTCOMES.confirmed },
  };
}

// plex_sleep/latest is tracked separately: a state failure must not decide how
// the sleep document is reported, and vice versa.
export async function recordSleepPersistence(
  write: () => Promise<unknown>,
): Promise<Outcome<SleepPersistenceOutcomeCode>> {
  try {
    await write();
    return {
      code: "confirmed",
      message: SLEEP_PERSISTENCE_OUTCOMES.confirmed,
    };
  } catch {
    return {
      code: "write-unconfirmed",
      message: SLEEP_PERSISTENCE_OUTCOMES["write-unconfirmed"],
    };
  }
}
