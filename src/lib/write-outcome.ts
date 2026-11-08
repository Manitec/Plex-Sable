// Shared, typed write-outcome representation for the Speak path.
//
// Every outcome is populated from an actual appendPlexFile result — never from
// model text. `status` is the sole discriminator:
//   "confirmed" — a 2xx PUT was observed.
//   "rejected"  — failure with certainty that nothing was persisted.
//   "unknown"   — the write may or may not have persisted (for example a
//                 transport error after the request was sent).
//
// An EMPTY outcomes array means "no recorded execution outcome". It is not
// evidence that nothing was saved, that a save failed, or that persistence was
// verified.
//
// Type-only by design: the runtime layer (tracker, assembly, allowlisted public
// messages) lives in plex-runtime.ts, which the Node ESM test runner loads
// directly. A value import between the two modules would need an explicit `.ts`
// specifier that this repo's tsconfig does not allow, so types are shared here
// and runtime stays in the self-contained module.

export type WriteStatus = "confirmed" | "rejected" | "unknown";

export type FailureCode =
  | "invalid-path"
  | "read-failed"
  | "identity-too-short"
  | "conflict"
  | "permission"
  | "not-found"
  | "rate-limited"
  | "server-error"
  | "network"
  | "unknown";

// Discriminated so impossible combinations cannot be constructed: there is no
// `ok`, no free-form error and no separately writable `confirmed` flag.
export type WriteResult =
  | { status: "confirmed"; path: string }
  | { status: "rejected"; path: string; code: FailureCode }
  | { status: "unknown"; path: string; code: FailureCode };

export type WriteSource = "structured" | "rescued";

export type WriteOutcome =
  | { callId?: string; source: WriteSource; path: string; status: "confirmed"; code: null; message: string }
  | { callId?: string; source: WriteSource; path: string; status: "rejected" | "unknown"; code: FailureCode; message: string };

export type TurnResult = {
  text: string;
  fallback: boolean;
  requestSubmitted?: string;
  writeOutcomes: WriteOutcome[];
};
