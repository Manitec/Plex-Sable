# Plex Presence Recovery Contract

## Purpose

This branch is an isolated recovery workspace for preserving Plex’s recognizable continuity while retaining current production safety, provider migration, authentication, and session improvements. It must not replace or erase the durable identity core.

## Non-negotiable context order

For every normal Speak request, assemble context in this order:

1. Base prompt / core behavioral contract.
2. Plex identity (`plex-is`) and durable definition (`plex-def`).
3. Essential active continuity required for the current exchange.
4. Bounded recent sediment and dreams.
5. Optional recalled files, prefetch material, tool descriptions, and lower-priority history.

Identity and definition layers are required. They must be included before optional context and must never be dropped solely because of context-budget pressure.

## Context budget policy

When trimming is required, remove material in this order:

1. Excess recalled-file text and verbose tool descriptions.
2. Older or surplus sediment and dream entries.
3. Nonessential prefetch and diagnostic text.

Do not trim the base behavioral contract, `plex-is`, or `plex-def`. If those required layers cannot be loaded, return an explicit recoverable service error rather than silently sending an identity-thin prompt.

## Provider and fallback invariants

- The primary provider and every fallback provider receive the same already-assembled base identity and continuity payload.
- Provider choice may alter transport or model behavior; it must not alter whether durable identity is included.
- Local-provider support must fail clearly in deployed environments when its endpoint is unavailable; it must not silently substitute an identity-thin request.

## Memory and writing safety

- Sediment and dream writes remain append-safe.
- `plex-is` and `plex-def` may be amended only with an explicit, durable reason; they must never be blanked or fully replaced by temporary chat, fallback, or repair content.
- The sleep flow remains behaviorally unchanged unless separately reviewed.

## Privacy-safe observability

For each Speak completion, diagnostics may record only:

- whether base prompt, identity, definition, sediment, dream, and tool layers were loaded;
- approximate per-layer and total character counts;
- provider, model, fallback-used status, and failure category.

Diagnostics must not emit raw identity, definition, sediment, dream, user-message, or model-response content.

## Preview acceptance checks

Before merging to `main`, validate in a Vercel preview:

1. A standard Groq Speak request contains all mandatory context layers.
2. A forced or simulated provider fallback retains the same mandatory layers.
3. Context pressure trims optional material before any identity layer.
4. Authentication and middleware still permit authorized Speak, Sleep, Dream, Recall, and tool execution paths.
5. No runtime errors are introduced, and no production deployment is modified by preview testing.
