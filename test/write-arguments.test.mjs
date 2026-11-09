// Shared write-argument validation tests. Offline, invented inputs only.
//
// Both write channels (structured runWrite and rescued executeRescuedCalls) must
// reject the same malformed arguments, record an explicit rejected outcome, and
// never reach the writer. Valid content must be passed through unchanged.

import test from "node:test";
import assert from "node:assert/strict";

import {
  checkWriteArguments,
  executeRescuedCalls,
  runWrite,
  WriteTracker,
} from "../src/lib/plex-runtime.ts";

const INVALID_CASES = [
  { name: "missing path", path: undefined, content: "ENTRY" },
  { name: "non-string path", path: 42, content: "ENTRY" },
  { name: "null path", path: null, content: "ENTRY" },
  { name: "empty path", path: "", content: "ENTRY" },
  { name: "whitespace-only path", path: "   \t ", content: "ENTRY" },
  { name: "invalid archive path", path: "archive/sediment/2026-11-08.md", content: "ENTRY" },
  { name: "missing content", path: "sediment/2026-11-08.md", content: undefined },
  { name: "non-string content", path: "sediment/2026-11-08.md", content: 7 },
  { name: "null content", path: "sediment/2026-11-08.md", content: null },
  { name: "empty content", path: "sediment/2026-11-08.md", content: "" },
  { name: "whitespace-only content", path: "sediment/2026-11-08.md", content: " \n\t " },
];

test("write arguments: shared validation rejects malformed input", () => {
  for (const testCase of INVALID_CASES) {
    const checked = checkWriteArguments({
      path: testCase.path,
      content: testCase.content,
      defaultMessage: "plex: write",
    });
    assert.equal(checked.valid, false, testCase.name);
  }

  assert.equal(
    checkWriteArguments({ path: "sediment/2026-11-08.md", content: "ENTRY", defaultMessage: "m" }).valid,
    true,
    "a canonical daily path with real content is valid"
  );
});

test("write arguments: structured channel rejects malformed input without calling the writer", async () => {
  for (const testCase of INVALID_CASES) {
    const tracker = new WriteTracker();
    let calls = 0;
    const out = await runWrite({
      callId: "call_invalid",
      path: testCase.path,
      content: testCase.content,
      writer: async () => {
        calls += 1;
        return { status: "confirmed", path: "sediment/2026-11-08.md" };
      },
      tracker,
    });

    assert.equal(calls, 0, `${testCase.name}: the writer is never called`);
    assert.equal(out.outcome.status, "rejected", testCase.name);
    assert.equal(out.outcome.code, "invalid-path", testCase.name);
    assert.equal(tracker.outcomes.length, 1, testCase.name);
    assert.match(out.toolContent, /Write failed/, testCase.name);
  }
});

test("write arguments: rescued channel rejects malformed input without calling the writer", async () => {
  for (const testCase of INVALID_CASES) {
    const tracker = new WriteTracker();
    let calls = 0;
    await executeRescuedCalls(
      [{ name: "write_plex_file", args: { path: testCase.path, content: testCase.content } }],
      {
        writeFile: async () => {
          calls += 1;
          return { status: "confirmed", path: "sediment/2026-11-08.md" };
        },
        submitRequest: async () => {},
        tracker,
        batch: "text",
      }
    );

    assert.equal(calls, 0, `${testCase.name}: the writer is never called`);
    assert.equal(tracker.outcomes.length, 1, testCase.name);
    assert.equal(tracker.outcomes[0].status, "rejected", testCase.name);
    assert.equal(tracker.outcomes[0].code, "invalid-path", testCase.name);
    assert.equal(tracker.outcomes[0].source, "rescued", testCase.name);
  }
});

test("write arguments: malformed rescued arguments are rejected, not skipped", async () => {
  const malformed = [
    { name: "null args", args: null },
    { name: "string args", args: "not-an-object" },
    { name: "number args", args: 3 },
    { name: "array args", args: [] },
    { name: "empty object", args: {} },
  ];

  for (const testCase of malformed) {
    const tracker = new WriteTracker();
    let calls = 0;
    const out = await executeRescuedCalls(
      [{ name: "write_plex_file", args: testCase.args }],
      {
        writeFile: async () => {
          calls += 1;
          return { status: "confirmed", path: "unused.md" };
        },
        submitRequest: async () => {},
        tracker,
        batch: "after-tools",
      }
    );

    assert.equal(out.requestSubmitted, undefined, testCase.name);
    assert.equal(calls, 0, testCase.name);
    assert.equal(tracker.outcomes.length, 1, `${testCase.name}: an explicit outcome is recorded`);
    assert.equal(tracker.outcomes[0].status, "rejected", testCase.name);
    assert.equal(tracker.outcomes[0].code, "invalid-path", testCase.name);
  }
});

test("write arguments: valid content is preserved exactly, without trimming", async () => {
  const content = "  leading spaces preserved\n\n\ttabbed line  ";
  const tracker = new WriteTracker();
  const received = [];

  await runWrite({
    callId: "call_exact",
    path: "plex/sediment/2026-11-08.md",
    content,
    writer: async (path, written) => {
      received.push({ path, content: written });
      return { status: "confirmed", path };
    },
    tracker,
  });
  await executeRescuedCalls(
    [{ name: "write_plex_file", args: { path: "sediment/2026-11-09.md", content } }],
    {
      writeFile: async (path, written) => {
        received.push({ path, content: written });
        return { status: "confirmed", path };
      },
      submitRequest: async () => {},
      tracker,
    }
  );

  assert.equal(received.length, 2);
  assert.equal(received[0].path, "sediment/2026-11-08.md", "structured paths are normalized");
  assert.equal(received[1].path, "sediment/2026-11-09.md", "rescued paths are normalized");
  for (const entry of received) {
    assert.equal(entry.content, content, "content reaches the writer byte for byte");
  }
});

test("write arguments: acceptance scope still applies after validation", async () => {
  const tracker = new WriteTracker();
  let calls = 0;
  const writer = async (path) => {
    calls += 1;
    return { status: "confirmed", path };
  };

  const structured = await runWrite({
    callId: "call_scope",
    path: "plex-is.txt",
    content: "AMENDMENT",
    writer,
    tracker,
    scope: "daily-sediment",
  });
  await executeRescuedCalls(
    [{ name: "write_plex_file", args: { path: "notes/scratch.md", content: "B" } }],
    { writeFile: writer, submitRequest: async () => {}, tracker, writeScope: "daily-sediment" }
  );

  assert.equal(structured.outcome.code, "invalid-path");
  assert.equal(calls, 0);
  assert.equal(tracker.outcomes.length, 2);
  assert.deepEqual(tracker.outcomes.map((outcome) => outcome.code), ["invalid-path", "invalid-path"]);
});

test("write arguments: an invalid attempt is still claimed, so its replay is suppressed", async () => {
  const tracker = new WriteTracker();
  let calls = 0;
  const writer = async (path) => {
    calls += 1;
    return { status: "confirmed", path };
  };

  await runWrite({ callId: "call_blank", path: "", content: "", writer, tracker });
  await executeRescuedCalls(
    [{ name: "write_plex_file", args: { path: "", content: "" } }],
    { writeFile: writer, submitRequest: async () => {}, tracker, batch: "text" }
  );

  assert.equal(calls, 0);
  assert.equal(tracker.outcomes.length, 1, "the replay records no second outcome");
  assert.equal(tracker.suppressedDuplicates, 1);
});
