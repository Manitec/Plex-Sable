// Write-outcome propagation tests. Offline, invented inputs only.
//
// These exercise real code: the structured write runner, the rescued-call
// executor, the tracker and the turn-result assembler. The route's model-call
// chain, the POST JSON shape and the client rendering are NOT covered here and
// remain source-reviewed.

import test from "node:test";
import assert from "node:assert/strict";

import {
  appendPlexFile,
  assembleErrorResult,
  assembleTurnResult,
  canonicalWriteKey,
  escapeDisplayPath,
  executeRescuedCalls,
  PUBLIC_MESSAGE,
  runWrite,
  WriteTracker,
} from "../src/lib/plex-runtime.ts";

function b64(text) {
  return Buffer.from(text, "utf-8").toString("base64");
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload, text: async () => JSON.stringify(payload) };
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const entry = {
      url: String(url),
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(entry);
    return handler(entry, calls.length);
  };
  return {
    calls,
    puts() {
      return calls.filter((c) => c.method === "PUT");
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

const okResult = (path) => ({ status: "confirmed", path });
const rejected = (path, code) => ({ status: "rejected", path, code });
const uncertain = (path, code) => ({ status: "unknown", path, code });

test("write outcome: structured success is confirmed and keeps its call id", async () => {
  const tracker = new WriteTracker();
  const calls = [];
  const out = await runWrite({
    callId: "call_1",
    path: "plex/sediment/2026-11-03.md",
    content: "ENTRY",
    writer: async (...args) => {
      calls.push(args);
      return okResult("sediment/2026-11-03.md");
    },
    tracker,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "sediment/2026-11-03.md", "the writer receives the canonical path");
  assert.equal(out.outcome.status, "confirmed");
  assert.equal(out.outcome.callId, "call_1");
  assert.equal(out.outcome.path, "sediment/2026-11-03.md");
  assert.match(out.toolContent, /File written successfully/);
  assert.equal(tracker.outcomes.length, 1);

  // The public receipt carries exactly these fields and nothing else.
  assert.deepEqual(Object.keys(out.outcome).sort(), ["callId", "code", "message", "path", "source", "status"]);
  assert.equal(out.outcome.code, null);
  // The exact content is an internal key input only; it must never serialise.
  const serializedTurn = JSON.stringify(assembleTurnResult({ text: "saved", fallback: false, tracker }));
  assert.equal(serializedTurn.includes("ENTRY"), false);
});

test("write outcome: structured rejection and uncertainty stay distinct", async () => {
  const tracker = new WriteTracker();

  const rejectedOut = await runWrite({
    callId: "call_r",
    path: "sediment/2026-11-03.md",
    content: "A",
    writer: async () => rejected("sediment/2026-11-03.md", "conflict"),
    tracker,
  });
  const unknownOut = await runWrite({
    callId: "call_u",
    path: "sediment/2026-11-04.md",
    content: "B",
    writer: async () => uncertain("sediment/2026-11-04.md", "server-error"),
    tracker,
  });

  assert.equal(rejectedOut.outcome.status, "rejected");
  assert.equal(rejectedOut.outcome.code, "conflict");
  assert.equal(rejectedOut.outcome.message, PUBLIC_MESSAGE.conflict);
  assert.match(rejectedOut.toolContent, /Write failed: changed by someone else at the same time/);

  assert.equal(unknownOut.outcome.status, "unknown");
  assert.match(unknownOut.toolContent, /may or may not have been updated/);
  assert.equal(tracker.outcomes.length, 2);
});

test("write outcome: a thrown structured writer is recorded as unknown", async () => {
  const tracker = new WriteTracker();
  const out = await runWrite({
    callId: "call_throw",
    path: "sediment/2026-11-03.md",
    content: "A",
    writer: async () => {
      throw new Error("socket hang up: Bearer sk-secret-value");
    },
    tracker,
  });

  assert.equal(out.outcome.status, "unknown");
  assert.equal(out.outcome.code, "unknown", "a generic throw does not establish a network failure");
  assert.equal(tracker.outcomes.length, 1);
  assert.equal(JSON.stringify(tracker.outcomes).includes("sk-secret-value"), false);
  assert.equal(JSON.stringify(tracker.outcomes).includes("socket hang up"), false);
});

test("write outcome: a repeated structured id does not execute twice and still answers", async () => {
  const tracker = new WriteTracker();
  let calls = 0;
  const writer = async () => {
    calls += 1;
    return okResult("sediment/2026-11-03.md");
  };

  const first = await runWrite({ callId: "call_dup", path: "sediment/2026-11-03.md", content: "A", writer, tracker });
  const second = await runWrite({ callId: "call_dup", path: "sediment/2026-11-03.md", content: "A", writer, tracker });

  assert.equal(calls, 1, "the same structured id must not execute twice");
  assert.equal(tracker.outcomes.length, 1);
  assert.equal(tracker.suppressedDuplicates, 1);
  assert.equal(typeof second.toolContent, "string");
  assert.ok(second.toolContent.length > 0, "the tool call is never left unanswered");
  assert.match(second.toolContent, /not executed again/i);
  assert.equal(second.toolContent.includes("File written successfully"), false, "no new success is claimed");
  assert.equal(second.outcome, undefined);
  assert.equal(first.outcome.status, "confirmed");
});

test("write outcome: a repeated structured id never turns a failure into success", async () => {
  const tracker = new WriteTracker();
  let calls = 0;
  const writer = async () => {
    calls += 1;
    return rejected("sediment/2026-11-03.md", "conflict");
  };

  const first = await runWrite({ callId: "call_dup_r", path: "sediment/2026-11-03.md", content: "B", writer, tracker });
  const second = await runWrite({ callId: "call_dup_r", path: "sediment/2026-11-03.md", content: "B", writer, tracker });

  assert.equal(calls, 1, "the writer runs exactly once");
  assert.equal(first.outcome.status, "rejected");
  assert.equal(tracker.outcomes.length, 1, "no second outcome is recorded");
  assert.equal(tracker.outcomes[0].status, "rejected");
  assert.equal(tracker.suppressedDuplicates, 1);
  assert.match(second.toolContent, /rejected/i, "the repeat answers with the prior failure state");
  assert.equal(second.toolContent.includes("File written successfully"), false);
  assert.equal(second.outcome, undefined, "no fabricated success outcome");
});

test("write outcome: distinct structured ids with identical content both execute", async () => {
  const tracker = new WriteTracker();
  let calls = 0;
  const writer = async () => {
    calls += 1;
    return okResult("sediment/2026-11-03.md");
  };

  for (const callId of ["call_a", "call_b"]) {
    await runWrite({ callId, path: "sediment/2026-11-03.md", content: "SAME", writer, tracker });
  }

  assert.equal(calls, 2);
  assert.equal(tracker.outcomes.length, 2);
  assert.deepEqual(tracker.outcomes.map((o) => o.callId), ["call_a", "call_b"]);
});

test("write outcome: a rescued replay cannot retry a rejected structured write", async () => {
  const tracker = new WriteTracker();
  const spy = [];
  const writer = async (...args) => {
    spy.push(args);
    return rejected("sediment/2026-11-03.md", "conflict");
  };

  await runWrite({ callId: "call_r", path: "sediment/2026-11-03.md", content: "SAME", message: "plex: write", writer, tracker });
  await executeRescuedCalls(
    [{ name: "write_plex_file", args: { path: "sediment/2026-11-03.md", content: "SAME", message: "a different commit message" } }],
    { writeFile: writer, submitRequest: async () => {}, tracker, batch: "after-tools" }
  );

  assert.equal(spy.length, 1, "a failed structured attempt must not be retried as text");
  assert.equal(tracker.outcomes.length, 1);
  assert.equal(tracker.suppressedDuplicates, 1);
});

test("write outcome: rescued outcomes reach assembled output exactly once", async () => {
  const tracker = new WriteTracker();
  let calls = 0;

  await executeRescuedCalls(
    [{ name: "write_plex_file", args: { path: "sediment/2026-11-03.md", content: "NEW" } }],
    {
      writeFile: async () => {
        calls += 1;
        return okResult("sediment/2026-11-03.md");
      },
      submitRequest: async () => {},
      tracker,
      batch: "after-tools",
    }
  );

  const assembled = assembleTurnResult({ text: "saved it", fallback: true, tracker });
  const again = assembleTurnResult({ text: "saved it", fallback: true, tracker });

  assert.equal(calls, 1);
  assert.equal(assembled.writeOutcomes.length, 1);
  assert.equal(assembled.writeOutcomes[0].status, "confirmed");
  assert.equal(assembled.writeOutcomes[0].source, "rescued");
  assert.equal(assembled.writeOutcomes[0].callId, "rescued:after-tools:0");
  assert.equal(assembled.fallback, true);
  assert.equal(again.writeOutcomes.length, 1, "re-assembly must not duplicate the outcome");
});

test("write outcome: a rescued returned failure is explicit, not a success", async () => {
  const tracker = new WriteTracker();

  await executeRescuedCalls(
    [{ name: "write_plex_file", args: { path: "sediment/2026-11-03.md", content: "NEW" } }],
    {
      writeFile: async () => rejected("sediment/2026-11-03.md", "read-failed"),
      submitRequest: async () => {},
      tracker,
    }
  );

  const [outcome] = tracker.outcomes;
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.code, "read-failed");
  assert.equal(outcome.message, PUBLIC_MESSAGE["read-failed"]);
});

test("write outcome: a thrown rescued writer is unknown and leaks no raw text", async () => {
  const tracker = new WriteTracker();

  await executeRescuedCalls(
    [{ name: "write_plex_file", args: { path: "sediment/2026-11-03.md", content: "NEW" } }],
    {
      writeFile: async () => {
        throw new Error("upstream 502: Bearer tok_live_123");
      },
      submitRequest: async () => {},
      tracker,
    }
  );

  const [outcome] = tracker.outcomes;
  assert.equal(outcome.status, "unknown");
  assert.equal(outcome.code, "unknown", "an unclassified throw is not labelled a network failure");
  const serialized = JSON.stringify(outcome);
  assert.equal(serialized.includes("tok_live_123"), false);
  assert.equal(serialized.includes("upstream 502"), false);
});

test("write outcome: identical rescued commands in one batch execute once", async () => {
  const tracker = new WriteTracker();
  let calls = 0;

  await executeRescuedCalls(
    [
      { name: "write_plex_file", args: { path: "sediment/2026-11-03.md", content: "SAME" } },
      { name: "write_plex_file", args: { path: "sediment/2026-11-03.md", content: "SAME", message: "different message" } },
    ],
    {
      writeFile: async () => {
        calls += 1;
        return okResult("sediment/2026-11-03.md");
      },
      submitRequest: async () => {},
      tracker,
      batch: "after-tools",
    }
  );

  assert.equal(calls, 1);
  assert.equal(tracker.outcomes.length, 1);
  assert.equal(tracker.suppressedDuplicates, 1);
});

test("write outcome: rescued writes to the same path with different content both execute", async () => {
  const tracker = new WriteTracker();
  let calls = 0;

  await executeRescuedCalls(
    [
      { name: "write_plex_file", args: { path: "sediment/2026-11-03.md", content: "ONE" } },
      { name: "write_plex_file", args: { path: "sediment/2026-11-03.md", content: "TWO" } },
    ],
    {
      writeFile: async () => {
        calls += 1;
        return okResult("sediment/2026-11-03.md");
      },
      submitRequest: async () => {},
      tracker,
    }
  );

  assert.equal(calls, 2);
  assert.equal(tracker.outcomes.length, 2);
});

test("write outcome: mixed outcomes keep execution order", async () => {
  const tracker = new WriteTracker();

  await runWrite({ callId: "c1", path: "sediment/2026-11-01.md", content: "A", writer: async () => okResult("sediment/2026-11-01.md"), tracker });
  await runWrite({ callId: "c2", path: "sediment/2026-11-02.md", content: "B", writer: async () => rejected("sediment/2026-11-02.md", "conflict"), tracker });
  await runWrite({ callId: "c3", path: "sediment/2026-11-03.md", content: "C", writer: async () => uncertain("sediment/2026-11-03.md", "server-error"), tracker });

  assert.deepEqual(tracker.outcomes.map((o) => [o.callId, o.status]), [
    ["c1", "confirmed"],
    ["c2", "rejected"],
    ["c3", "unknown"],
  ]);
});

test("write outcome: no attempt produces an empty array, never an invented receipt", async () => {
  const tracker = new WriteTracker();

  await executeRescuedCalls([], {
    writeFile: async () => {
      throw new Error("must not run");
    },
    submitRequest: async () => {},
    tracker,
  });

  const assembled = assembleTurnResult({ text: "nothing was written", fallback: true, tracker });
  assert.deepEqual(assembled.writeOutcomes, []);
  assert.equal(assembled.requestSubmitted, undefined);
  assert.equal(JSON.stringify(assembled).includes("confirmed"), false);
});

test("write outcome: assembly retains an outcome recorded before a fallback", async () => {
  const tracker = new WriteTracker();

  await runWrite({
    callId: "call_1",
    path: "sediment/2026-11-03.md",
    content: "A",
    writer: async () => okResult("sediment/2026-11-03.md"),
    tracker,
  });

  const assembled = assembleTurnResult({ text: "thin voice", fallback: true, tracker });
  assert.equal(assembled.fallback, true);
  assert.equal(assembled.writeOutcomes.length, 1);
  assert.equal(assembled.writeOutcomes[0].status, "confirmed");
});

test("write outcome: a completed write survives a response-generation failure", async () => {
  const tracker = new WriteTracker();
  await runWrite({
    callId: "call_1",
    path: "sediment/2026-11-03.md",
    content: "A",
    writer: async () => okResult("sediment/2026-11-03.md"),
    tracker,
  });

  // Synthetic: reply generation and its fallback both throw. No model is called
  // and no route is executed; this drives the same tracker + shared helper the
  // POST error path uses.
  const primary = () => {
    throw new Error("primary down: Bearer sk-live-999");
  };
  const fallback = () => {
    throw new Error("fallback down: Bearer sk-live-999");
  };

  let payload;
  try {
    primary();
  } catch {
    try {
      fallback();
    } catch {
      payload = assembleErrorResult({ message: "Plex unavailable", tracker });
    }
  }

  assert.deepEqual(
    payload,
    {
      error: "Plex unavailable",
      writeOutcomes: [
        { callId: "call_1", source: "structured", path: "sediment/2026-11-03.md", status: "confirmed", code: null, message: "saved" },
      ],
    },
    "the confirmed outcome is retained exactly once and not relabelled"
  );
  assert.equal(payload.writeOutcomes.length, 1);
  assert.equal(payload.writeOutcomes[0].status, "confirmed");
  assert.deepEqual(Object.keys(payload).sort(), ["error", "writeOutcomes"]);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("sk-live-999"), false);
  assert.equal(serialized.includes("primary down"), false);
  assert.equal(serialized.includes("fallback down"), false);
});

test("write outcome: an error payload with no attempted write stays empty", () => {
  const payload = assembleErrorResult({ message: "Plex unavailable", tracker: new WriteTracker() });
  assert.deepEqual(payload, { error: "Plex unavailable", writeOutcomes: [] });
});

test("write outcome: appendPlexFile maps read and PUT failures to codes", async () => {
  const readOk = () => jsonResponse({ content: b64("A-ENTRY"), sha: "sha-1" });
  const cases = [
    {
      name: "unreadable existing content",
      handler: (entry) => (entry.method === "PUT" ? jsonResponse({}) : jsonResponse({ message: "boom" }, false, 500)),
      expected: rejected("sediment/2026-11-03.md", "read-failed"),
      puts: 0,
    },
    {
      name: "permission failure on read",
      handler: () => jsonResponse({ message: "Bad credentials" }, false, 403),
      expected: rejected("sediment/2026-11-03.md", "permission"),
      puts: 0,
    },
    {
      name: "concurrent-write conflict",
      handler: (entry) => (entry.method === "PUT" ? jsonResponse({ message: "sha does not match" }, false, 409) : readOk()),
      expected: rejected("sediment/2026-11-03.md", "conflict"),
      puts: 1,
    },
    {
      name: "server error after the PUT was sent",
      handler: (entry) => (entry.method === "PUT" ? jsonResponse({ message: "boom" }, false, 500) : readOk()),
      expected: uncertain("sediment/2026-11-03.md", "server-error"),
      puts: 1,
    },
    {
      name: "transport failure during the PUT",
      handler: (entry) => {
        if (entry.method === "PUT") throw new Error("ECONNRESET");
        return readOk();
      },
      expected: uncertain("sediment/2026-11-03.md", "network"),
      puts: 1,
    },
    {
      name: "successful append",
      handler: (entry) => (entry.method === "PUT" ? jsonResponse({ content: {} }) : readOk()),
      expected: okResult("sediment/2026-11-03.md"),
      puts: 1,
    },
  ];

  for (const testCase of cases) {
    const stub = stubFetch(testCase.handler);
    try {
      const result = await appendPlexFile("sediment/2026-11-03.md", "NEW-ENTRY", "plex: write", "tok");
      assert.deepEqual(result, testCase.expected, testCase.name);
      assert.equal(stub.puts().length, testCase.puts, testCase.name);
    } finally {
      stub.restore();
    }
  }
});

test("write outcome: an invalid archive path is rejected before any request", async () => {
  const stub = stubFetch(() => jsonResponse({}));
  try {
    const result = await appendPlexFile("archive/sediment/2026-11-03.md", "X", "plex: write", "tok");
    assert.deepEqual(result, rejected("archive/sediment/2026-11-03.md", "invalid-path"));
    assert.equal(stub.calls.length, 0, "an invalid path must not reach the network");
  } finally {
    stub.restore();
  }
});

test("write outcome: public messages are allowlisted and paths are bounded", () => {
  for (const code of Object.keys(PUBLIC_MESSAGE)) {
    assert.equal(typeof PUBLIC_MESSAGE[code], "string");
    assert.ok(PUBLIC_MESSAGE[code].length > 0);
  }

  const escaped = escapeDisplayPath(`a\nb\u0000c${"x".repeat(200)}`);
  assert.equal(escaped.includes("\n"), false);
  assert.ok(escaped.length <= 80);
  assert.equal(escapeDisplayPath(""), "(no path)");
  assert.equal(escapeDisplayPath(undefined), "(no path)");
  assert.equal(escapeDisplayPath(42), "(no path)");
});

test("write outcome: the content key ignores the commit message but not content or path", () => {
  assert.equal(canonicalWriteKey("sediment/x.md", "A"), canonicalWriteKey("sediment/x.md", "A"));
  assert.notEqual(canonicalWriteKey("sediment/x.md", "A"), canonicalWriteKey("sediment/x.md", "B"));
  assert.notEqual(canonicalWriteKey("sediment/x.md", "A"), canonicalWriteKey("dreams/x.md", "A"));
});
