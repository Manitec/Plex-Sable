// Rescued action-permission tests. Offline, invented inputs only.
//
// A sediment-save acceptance must enable the write tool and nothing else. These
// tests drive the real rescued executor across every batch label the route uses,
// so a blocked action cannot slip through a retry or fallback path.

import test from "node:test";
import assert from "node:assert/strict";

import {
  executeRescuedCalls,
  isRescuedActionPermitted,
  isWritePathPermitted,
  WriteTracker,
} from "../src/lib/plex-runtime.ts";

const BATCHES = ["primary-retry", "fallback", "text", "after-tools", "after-tools-fallback"];

function makeDeps(tracker, extra = {}) {
  const submitted = [];
  const writes = [];
  return {
    submitted,
    writes,
    deps: {
      writeFile: async (path, content, message) => {
        writes.push({ path, content, message });
        return { status: "confirmed", path };
      },
      submitRequest: async (request, notes) => {
        submitted.push({ request, notes });
      },
      tracker,
      ...extra,
    },
  };
}

test("rescued permissions: a sediment acceptance blocks submit_request in every batch", async () => {
  for (const batch of BATCHES) {
    const tracker = new WriteTracker();
    const { submitted, deps } = makeDeps(tracker, { writeScope: "daily-sediment", batch });

    const out = await executeRescuedCalls(
      [{ name: "submit_request", args: { request: "raise the token budget", notes: "n" } }],
      deps
    );

    assert.equal(submitted.length, 0, `${batch}: no ONE request is created`);
    assert.equal(out.requestSubmitted, undefined, batch);
    assert.equal(tracker.outcomes.length, 0, `${batch}: a blocked action invents no write outcome`);
  }
});

test("rescued permissions: a blocked submit_request does not stop an allowed write in the same batch", async () => {
  const tracker = new WriteTracker();
  const { submitted, writes, deps } = makeDeps(tracker, { writeScope: "daily-sediment", batch: "after-tools" });

  const out = await executeRescuedCalls(
    [
      { name: "submit_request", args: { request: "promote this", notes: "" } },
      { name: "write_plex_file", args: { path: "sediment/2026-11-08.md", content: "ENTRY" } },
    ],
    deps
  );

  assert.equal(submitted.length, 0);
  assert.equal(out.requestSubmitted, undefined);
  assert.equal(writes.length, 1, "the daily write still executes");
  assert.equal(writes[0].path, "sediment/2026-11-08.md");
  assert.equal(tracker.outcomes.length, 1);
  assert.equal(tracker.outcomes[0].status, "confirmed");
});

test("rescued permissions: acceptance still rejects non-daily write destinations", async () => {
  for (const batch of BATCHES) {
    const tracker = new WriteTracker();
    const { writes, deps } = makeDeps(tracker, { writeScope: "daily-sediment", batch });

    await executeRescuedCalls(
      [{ name: "write_plex_file", args: { path: "notes/scratch.md", content: "X" } }],
      deps
    );

    assert.equal(writes.length, 0, batch);
    assert.equal(tracker.outcomes.length, 1, batch);
    assert.equal(tracker.outcomes[0].status, "rejected", batch);
    assert.equal(tracker.outcomes[0].code, "invalid-path", batch);
  }
});

test("rescued permissions: non-acceptance behavior is preserved", async () => {
  for (const writeScope of [undefined, "any"]) {
    const tracker = new WriteTracker();
    const { submitted, deps } = makeDeps(tracker, { writeScope, batch: "text" });

    const out = await executeRescuedCalls(
      [{ name: "submit_request", args: { request: "raise the token budget", notes: "n" } }],
      deps
    );

    assert.equal(submitted.length, 1, `scope ${writeScope}: submit_request still runs`);
    assert.equal(submitted[0].request, "raise the token budget");
    assert.equal(out.requestSubmitted, "raise the token budget");
  }
});

test("rescued permissions: malformed submit_request arguments create nothing", async () => {
  const malformed = [
    { name: "null args", args: null },
    { name: "empty args", args: {} },
    { name: "non-string request", args: { request: 42 } },
    { name: "blank request", args: { request: "   " } },
    { name: "array args", args: [] },
  ];

  for (const testCase of malformed) {
    const tracker = new WriteTracker();
    const { submitted, deps } = makeDeps(tracker, { batch: "text" });

    const out = await executeRescuedCalls([{ name: "submit_request", args: testCase.args }], deps);

    assert.equal(submitted.length, 0, testCase.name);
    assert.equal(out.requestSubmitted, undefined, testCase.name);
  }
});

test("rescued permissions: the permission helpers expose the policy", () => {
  assert.equal(isRescuedActionPermitted("write_plex_file", "daily-sediment"), true);
  assert.equal(isRescuedActionPermitted("submit_request", "daily-sediment"), false);
  assert.equal(isRescuedActionPermitted("read_plex_file", "daily-sediment"), false);
  assert.equal(isRescuedActionPermitted("submit_request", "any"), true);
  assert.equal(isRescuedActionPermitted("submit_request", undefined), true);

  assert.equal(isWritePathPermitted("sediment/2026-11-08.md", "daily-sediment"), true);
  assert.equal(isWritePathPermitted("dreams/2026-11-08.md", "daily-sediment"), false);
  assert.equal(isWritePathPermitted("plex-is.txt", "daily-sediment"), false);
  assert.equal(isWritePathPermitted("plex-is.txt", "any"), true);
  assert.equal(isWritePathPermitted("plex-is.txt", undefined), true);
});
