import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'src/app/api/speak/route.ts';
const raw = readFileSync(path);
const sha = createHash('sha1').update(Buffer.from(`blob ${raw.length}\0`)).update(raw).digest('hex');
assert.equal(sha, '133526f924641e4ef6b5e0050d5cd84d4f8591fb', 'Route changed; stop rather than overwrite');
let source = raw.toString('utf8');
function replace(old, next, count = 1) {
  assert.equal(source.split(old).length - 1, count, `Unexpected replacement count: ${old}`);
  source = source.split(old).join(next);
}
replace('import { makeGroq } from "@/lib/plex-identity";', 'import { makeGroq } from "@/lib/plex-identity";\nimport { selectSessionHistory, toModelHistoryRole, type SessionHistorySelection } from "@/lib/session-history";');
replace('    const message = String(rawMessage).slice(0, 4000);', `    let historySelection: SessionHistorySelection;
    try {
      historySelection = selectSessionHistory(overrideHistory);
    } catch {
      return NextResponse.json({ error: "Invalid overrideHistory: expected supported roles and string content" }, { status: 400 });
    }

    const message = String(rawMessage).slice(0, 4000);`);
replace(`      const subHistory = (overrideHistory ?? []).map((m: any) => ({
        role: (m.role === "plex" || m.role === "assistant") ? ("assistant" as const) : ("user" as const),
        content: m.content as string,
      }));`, `      const subHistory = (historySelection.kind === "override" ? historySelection.messages : []).map((m) => ({
        role: toModelHistoryRole(m.role),
        content: m.content,
      }));`);
replace(`    if (overrideHistory && Array.isArray(overrideHistory)) {
      history = overrideHistory;`, `    if (historySelection.kind === "override") {
      history = historySelection.messages;`);
replace('m.role === "plex" ? ("assistant" as const) : ("user" as const)', 'toModelHistoryRole(m.role)', 2);
replace('m.role === "plex" ? "assistant" : "user"', 'toModelHistoryRole(m.role)');
replace('    if (!overrideHistory) {', '    if (historySelection.kind === "stored") {');
const result = Buffer.from(source);
assert.equal(createHash('sha1').update(Buffer.from(`blob ${result.length}\0`)).update(result).digest('hex'), '196562f852ff07fd426f347a0cb75925e4178efb');
writeFileSync(path, result);
console.log('Applied exact reviewed history integration.');
