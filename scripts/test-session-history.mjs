import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "plex-history-test-"));
const compiled = join(temp, "session-history.js");

try {
  const tsc = spawnSync(
    "npx",
    ["--no-install", "tsc", join(root, "src/lib/session-history.ts"), "--target", "ES2020", "--module", "commonjs", "--strict", "--skipLibCheck", "--outDir", temp],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(tsc.status, 0, `TypeScript compile failed:\n${tsc.stdout}\n${tsc.stderr}`);

  const generated = join(temp, "session-history.js");
  const modulePath = join(temp, "session-history.cjs");
  writeFileSync(modulePath, readFileSync(generated, "utf8"));
  const { selectSessionHistory, toModelHistoryRole } = await import(`file://${modulePath}`);

  assert.deepEqual(selectSessionHistory(undefined), { kind: "stored" });
  assert.deepEqual(selectSessionHistory(null), { kind: "stored" });
  assert.deepEqual(selectSessionHistory([]), { kind: "override", messages: [] });
  assert.deepEqual(selectSessionHistory([
    { role: "joe", content: "question" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "follow-up" },
    { role: "plex", content: "reply" },
  ]), {
    kind: "override",
    messages: [
      { role: "user", content: "question" },
      { role: "plex", content: "answer" },
      { role: "user", content: "follow-up" },
      { role: "plex", content: "reply" },
    ],
  });

  for (const bad of [false, 0, "bad", {}, [null], [[]], [{ role: "system", content: "x" }], [{ role: "joe", content: 4 }]]) {
    assert.throws(() => selectSessionHistory(bad), TypeError, `expected rejection for ${JSON.stringify(bad)}`);
  }

  assert.equal(toModelHistoryRole("plex"), "assistant");
  assert.equal(toModelHistoryRole("assistant"), "assistant");
  assert.equal(toModelHistoryRole("joe"), "user");
  assert.equal(toModelHistoryRole("user"), "user");
  assert.throws(() => toModelHistoryRole("system"), TypeError);

  const route = readFileSync(join(root, "src/app/api/speak/route.ts"), "utf8");
  assert.match(route, /overrideHistory/);
  console.log("Session-history contract tests passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
