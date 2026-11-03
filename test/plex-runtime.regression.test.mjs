// Safety regression tests: these assert the DESIRED behavior of the sediment
// write path. All must pass against the corrected read/append implementation.
//
// COVERAGE MOVED FROM THE CHARACTERIZATION SUITE (2026-11-03):
//   - "a failed read still produces an entry-only PUT"   → replaced by these
//     failed-read cases. That test asserted the defect (1 PUT writing an
//     entry-only document); the integrity requirement is the opposite.
//   - "a concurrent append is silently overwritten"      → replaced by the
//     conflict case below. That test asserted the silent-overwrite payload;
//     the requirement is explicit failure with no overwrite.
// Neither assertion was deleted to hide a regression: both pinned unsafe
// behavior that this batch intentionally removes.

import test from "node:test";
import assert from "node:assert/strict";

import { appendPlexFile, readPlexFileWithSha } from "../src/lib/plex-runtime.ts";

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
    gets() {
      return calls.filter((c) => c.method === "GET");
    },
    puts() {
      return calls.filter((c) => c.method === "PUT");
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

function writtenText(put) {
  return Buffer.from(put.body.content, "base64").toString("utf-8");
}

test("safety: a failed read must not be turned into a destructive PUT", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} });
    return jsonResponse({ message: "boom" }, false, 500);
  });
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "NEW-ENTRY", "plex: write", "tok");

    assert.equal(stub.puts().length, 0, "a read failure must not be followed by a PUT");
    assert.equal(result.ok, false, "an unreadable day file must surface as a failed write");
    assert.match(result.error, /could not read existing content/);
  } finally {
    stub.restore();
  }
});

test("safety: a permission failure is not an empty file", async () => {
  const stub = stubFetch(() => jsonResponse({ message: "Bad credentials" }, false, 401));
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "NEW-ENTRY", "plex: write", "tok");
    assert.equal(stub.puts().length, 0);
    assert.equal(result.ok, false);
    assert.match(result.error, /HTTP 401/);
  } finally {
    stub.restore();
  }
});

test("safety: a network error is not an empty file", async () => {
  const stub = stubFetch(() => {
    throw new Error("ECONNRESET");
  });
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "NEW-ENTRY", "plex: write", "tok");
    assert.equal(stub.puts().length, 0);
    assert.equal(result.ok, false);
    assert.match(result.error, /network error/);
  } finally {
    stub.restore();
  }
});

test("safety: a malformed response is not an empty file", async () => {
  const stub = stubFetch(() => jsonResponse({ message: "weird but 200" }));
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "NEW-ENTRY", "plex: write", "tok");
    assert.equal(stub.puts().length, 0);
    assert.equal(result.ok, false);
    assert.match(result.error, /malformed response/);
  } finally {
    stub.restore();
  }
});

test("safety: content and sha come from the same read", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} });
    return jsonResponse({ content: b64("A-ENTRY"), sha: "sha-from-that-read" });
  });
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "NEW-ENTRY", "plex: write", "tok");

    assert.deepEqual(result, { ok: true });
    assert.equal(stub.gets().length, 1, "the file must be read exactly once");
    const puts = stub.puts();
    assert.equal(puts.length, 1);
    assert.equal(puts[0].body.sha, "sha-from-that-read", "the PUT must carry the sha paired with the content read");
  } finally {
    stub.restore();
  }
});

test("safety: a concurrent-write conflict fails without overwriting", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ message: "sha does not match" }, false, 409);
    return jsonResponse({ content: b64("A-ENTRY"), sha: "sha-stale" });
  });
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "NEW-ENTRY", "plex: write", "tok");

    assert.equal(result.ok, false, "a conflict must be an explicit failure");
    assert.match(result.error, /Concurrent write conflict/);
    assert.equal(stub.puts().length, 1, "a conflict must not be retried into an overwrite");
    assert.equal(stub.puts()[0].body.sha, "sha-stale");
  } finally {
    stub.restore();
  }
});

test("safety: a genuine 404 creates the file without a sha", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} }, true, 201);
    return jsonResponse({ message: "Not Found" }, false, 404);
  });
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "FIRST-ENTRY", "plex: write", "tok");

    assert.deepEqual(result, { ok: true });
    const puts = stub.puts();
    assert.equal(puts.length, 1);
    assert.equal(puts[0].body.sha, undefined, "creation must not attach a sha");
    assert.equal(writtenText(puts[0]), "FIRST-ENTRY");
  } finally {
    stub.restore();
  }
});

test("safety: a failed creation stays an explicit failure", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ message: "boom" }, false, 500);
    return jsonResponse({ message: "Not Found" }, false, 404);
  });
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "FIRST-ENTRY", "plex: write", "tok");
    assert.equal(result.ok, false);
    assert.equal(result.error, "boom");
  } finally {
    stub.restore();
  }
});

test("safety: a normal append preserves existing text", async () => {
  const existing = "EXISTING-1\n\nEXISTING-2";
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} });
    return jsonResponse({ content: b64(existing), sha: "sha-current" });
  });
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "NEW-ENTRY", "plex: write", "tok");

    assert.deepEqual(result, { ok: true });
    const puts = stub.puts();
    assert.equal(puts.length, 1);
    assert.equal(writtenText(puts[0]), `${existing}\n\nNEW-ENTRY`);
    assert.equal(puts[0].body.sha, "sha-current");
  } finally {
    stub.restore();
  }
});

test("safety: two writers — A's stale append fails and B's entry survives", async () => {
  // Deterministic interleaving of the original S4 scenario: A reads, B saves,
  // A attempts its stale append. The fake repo enforces sha equality, so B's
  // entry can only survive if A's write is rejected. Kept alongside the one-GET
  // pairing test, which does not exercise two writers.
  const state = { content: "A-ENTRY", sha: "sha-v1", version: 1 };

  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") {
      if (entry.body.sha !== state.sha) return jsonResponse({ message: "sha does not match" }, false, 409);
      state.content = writtenText(entry);
      state.version += 1;
      state.sha = `sha-v${state.version}`;
      return jsonResponse({ content: {} });
    }
    const read = jsonResponse({ content: b64(state.content), sha: state.sha });
    // B saves another entry between A's read and A's write.
    state.content = `${state.content}\n\nB-ENTRY`;
    state.version += 1;
    state.sha = `sha-v${state.version}`;
    return read;
  });

  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "A-NEW-ENTRY", "plex: write", "tok");

    assert.equal(result.ok, false, "A must receive an explicit failure");
    assert.match(result.error, /Concurrent write conflict/);
    assert.equal(stub.puts().length, 1, "A must not retry into an overwrite");
    assert.equal(state.content.includes("B-ENTRY"), true, "B's entry must survive");
    assert.equal(state.content.includes("A-NEW-ENTRY"), false, "A's stale append must not be applied");
    assert.equal(state.sha, "sha-v2", "the stored version must be untouched by the rejected write");
  } finally {
    stub.restore();
  }
});

test("safety: an empty existing file is valid, not missing or malformed", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} });
    return jsonResponse({ content: "", sha: "sha-empty" });
  });
  try {
    const result = await appendPlexFile("sediment/2026-01-01.md", "FIRST-ENTRY", "plex: write", "tok");

    assert.deepEqual(result, { ok: true }, "an empty day file must be read as a valid file");
    assert.equal(stub.gets().length, 1);
    const puts = stub.puts();
    assert.equal(puts.length, 1);
    assert.equal(puts[0].body.sha, "sha-empty", "an existing empty file still supplies its sha");
    assert.equal(writtenText(puts[0]), "FIRST-ENTRY");
  } finally {
    stub.restore();
  }
});

test("safety: identity amendment keeps existing text, separator and paired sha", async () => {
  const existing = "Y".repeat(250);
  const amendment = "Z".repeat(90);
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} });
    return jsonResponse({ content: b64(existing), sha: "sha-identity" });
  });
  try {
    const result = await appendPlexFile("plex-is.txt", amendment, "plex: write", "tok");

    assert.deepEqual(result, { ok: true });
    const puts = stub.puts();
    assert.equal(puts.length, 1);
    assert.equal(writtenText(puts[0]), `${existing}\n\n---\n${amendment}`);
    assert.equal(puts[0].body.sha, "sha-identity");
  } finally {
    stub.restore();
  }
});

test("safety: a non-daily path is still replaced, now with the paired sha", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} });
    return jsonResponse({ content: b64("OLD-CONTENT"), sha: "sha-nondaily" });
  });
  try {
    const result = await appendPlexFile("notes/scratch.md", "REPLACEMENT", "plex: write", "tok");

    assert.deepEqual(result, { ok: true });
    const puts = stub.puts();
    assert.equal(puts.length, 1);
    assert.equal(writtenText(puts[0]), "REPLACEMENT", "non-daily paths are replaced, not appended");
    assert.equal(puts[0].body.sha, "sha-nondaily");
  } finally {
    stub.restore();
  }
});

test("safety: readPlexFileWithSha distinguishes the failure kinds", async () => {
  const cases = [
    { handler: () => jsonResponse({ message: "nope" }, false, 404), kind: "missing" },
    { handler: () => jsonResponse({ message: "nope" }, false, 403), kind: "failed" },
    { handler: () => jsonResponse({ encoding: "none", content: "big", sha: "s" }), kind: "failed" },
    { handler: () => jsonResponse({ content: "!!!not base64!!!", sha: "s" }), kind: "failed" },
    { handler: () => jsonResponse({ content: b64("ok"), sha: "" }), kind: "failed" },
    { handler: () => jsonResponse({ content: b64("ok"), sha: "s" }), kind: "ok" },
  ];
  for (const { handler, kind } of cases) {
    const stub = stubFetch(handler);
    try {
      const read = await readPlexFileWithSha("sediment/2026-01-01.md", "tok");
      assert.equal(read.kind, kind);
    } finally {
      stub.restore();
    }
  }
});
