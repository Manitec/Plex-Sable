// Offline, no-write coverage for the sleep observability patch.
//
// Two layers:
//   1. The extracted orchestration helper, driven with injected dependencies.
//   2. The real route module, transpiled and sandboxed the same way
//      scripts/test-speak-history.mjs loads Speak, so response compatibility,
//      step-log truthfulness, HTTP 200 behavior and continuation through the
//      sleep write and dream decision are exercised on the route itself.
//
// Every external dependency is mocked. Database paths and network URL/method
// pairs are strictly allowlisted, and violations are recorded before they throw
// and asserted empty, so a caught exception cannot hide them.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const silentConsole = { info() {}, warn() {}, error() {}, log() {} };

// Values returned by the helper and the route come from their own vm realms, so
// their prototypes differ from this realm's. Compare plain data, not identity.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function compileTs(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
}

function loadTsModule(path) {
  const api = {};
  vm.runInNewContext(compileTs(readFileSync(path, 'utf8')), {
    exports: api,
    Buffer,
    URL,
    console: silentConsole,
    process: { env: {} },
  });
  return api;
}

const helper = loadTsModule('src/lib/sleep-state.ts');
const {
  parseStateCompletion,
  updateSedimentStateWithOutcome,
  recordSleepPersistence,
} = helper;

// ─── Parser: the existing rule must be preserved exactly ─────────────────────

assert.deepEqual(plain(parseStateCompletion('warm')), { ok: true, state: 'warm' });
assert.deepEqual(plain(parseStateCompletion('  WARM  ')), { ok: true, state: 'warm' });
assert.deepEqual(plain(parseStateCompletion('Warm.')), { ok: true, state: 'warm' });
assert.deepEqual(plain(parseStateCompletion('arroused')), { ok: true, state: 'arroused' });
assert.deepEqual(plain(parseStateCompletion('warmth')), { ok: false, code: 'invalid-state' });
assert.deepEqual(plain(parseStateCompletion('')), { ok: false, code: 'empty-completion' });
assert.deepEqual(plain(parseStateCompletion('   \n\t')), { ok: false, code: 'empty-completion' });
// Ambiguous prose is preserved as rejected, never reinterpreted as "unsettled".
assert.deepEqual(plain(parseStateCompletion('not warm; unsettled')), { ok: false, code: 'invalid-state' });

// ─── Helper orchestration ────────────────────────────────────────────────────

function helperHarness(opts = {}) {
  const calls = [];
  const reads = [];
  const writes = [];
  const deps = {
    complete: async (input) => {
      calls.push(input);
      if (opts.completeThrows) throw new Error('MODEL SECRET TEXT');
      return opts.completion ?? 'heavy';
    },
    readCurrent: async () => {
      reads.push(true);
      if (opts.readThrows) throw new Error('READ SECRET TEXT');
      return {
        exists: true,
        data: opts.existing ?? { state: 'warm', history: [{ state: 'tender', timestamp: 't', source: 'sleep' }] },
      };
    },
    writeCurrent: async (data, options) => {
      writes.push({ data, options });
      if (opts.writeThrows) throw new Error('WRITE SECRET TEXT');
    },
    serverTimestamp: () => 'SERVER_TS',
    now: () => new Date('2026-11-10T00:00:00.000Z'),
  };
  return { calls, reads, writes, deps };
}

{
  const h = helperHarness();
  const longInput = 'x'.repeat(900);
  const result = await updateSedimentStateWithOutcome({ nyxOutput: longInput, today: '2026-11-10', deps: h.deps });
  assert.equal(result.state, 'heavy');
  assert.deepEqual(plain(result.outcome), { code: 'confirmed', message: 'state update confirmed' });
  assert.equal(h.calls[0].length, 800, 'completion input keeps the existing 800-character cap');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].data.state, 'heavy');
  assert.equal(h.writes[0].data.sessionRef, '2026-11-10');
  assert.equal(h.writes[0].data.source, 'sleep');
  assert.equal(h.writes[0].data.updatedAt, 'SERVER_TS');
  assert.equal(h.writes[0].data.note, 'Derived from nightly pass — 2026-11-10');
  assert.deepEqual(plain(h.writes[0].data.history[0]), {
    state: 'warm',
    timestamp: '2026-11-10T00:00:00.000Z',
    source: 'sleep',
  });
  assert.deepEqual(plain(h.writes[0].options), { merge: false });
}

{
  const h = helperHarness({ completion: '' });
  const result = await updateSedimentStateWithOutcome({ nyxOutput: 'nyx', today: '2026-11-10', deps: h.deps });
  assert.equal(result.state, null);
  assert.deepEqual(plain(result.outcome), { code: 'empty-completion', message: 'empty state completion' });
  assert.equal(h.reads.length, 0);
  assert.equal(h.writes.length, 0);
}

{
  const h = helperHarness({ completion: 'not warm; unsettled' });
  const result = await updateSedimentStateWithOutcome({ nyxOutput: 'nyx', today: '2026-11-10', deps: h.deps });
  assert.deepEqual(plain(result.outcome), { code: 'invalid-state', message: 'completion held no accepted state' });
  assert.equal(h.reads.length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(JSON.stringify(result).includes('unsettled'), false, 'completion text must not cross the outcome boundary');
}

{
  const h = helperHarness({ completeThrows: true });
  const result = await updateSedimentStateWithOutcome({ nyxOutput: 'nyx', today: '2026-11-10', deps: h.deps });
  assert.deepEqual(plain(result.outcome), { code: 'model-error', message: 'state model call failed' });
  assert.equal(h.reads.length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
}

{
  const h = helperHarness({ readThrows: true });
  const result = await updateSedimentStateWithOutcome({ nyxOutput: 'nyx', today: '2026-11-10', deps: h.deps });
  assert.deepEqual(plain(result.outcome), { code: 'read-error', message: 'current state could not be read' });
  assert.equal(h.writes.length, 0);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
}

{
  const h = helperHarness({ writeThrows: true });
  const result = await updateSedimentStateWithOutcome({ nyxOutput: 'nyx', today: '2026-11-10', deps: h.deps });
  assert.equal(result.state, null);
  assert.deepEqual(plain(result.outcome), { code: 'write-unconfirmed', message: 'state write did not confirm' });
  assert.equal(h.writes.length, 1, 'the attempted write is still observable');
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
}

// Unexpected parser/input-shape failures must not reject the caller, and must
// not be labelled as a model failure or as an unconfirmed write.
{
  const h = helperHarness({ completion: { unexpected: true } });
  const result = await updateSedimentStateWithOutcome({ nyxOutput: 'nyx', today: '2026-11-10', deps: h.deps });
  assert.equal(result.state, null);
  assert.deepEqual(plain(result.outcome), { code: 'preparation-error', message: 'state preparation failed before any write' });
  assert.equal(h.calls.length, 1, 'the completion was called with a string input');
  assert.equal(h.reads.length, 0);
  assert.equal(h.writes.length, 0, 'no write attempt on an unexpected completion shape');
}
{
  const h = helperHarness();
  const result = await updateSedimentStateWithOutcome({ nyxOutput: null, today: '2026-11-10', deps: h.deps });
  assert.deepEqual(plain(result.outcome), { code: 'preparation-error', message: 'state preparation failed before any write' });
  assert.equal(h.calls.length, 0, 'the completion service is not reached when the input cannot be shaped');
  assert.equal(h.writes.length, 0);
}
// Malformed history is refused, never repaired or discarded.
{
  const existing = { state: 'warm', history: 'corrupt' };
  const h = helperHarness({ existing });
  const result = await updateSedimentStateWithOutcome({ nyxOutput: 'nyx', today: '2026-11-10', deps: h.deps });
  assert.deepEqual(plain(result.outcome), { code: 'preparation-error', message: 'state preparation failed before any write' });
  assert.equal(h.writes.length, 0, 'malformed history is not rewritten');
  assert.deepEqual(plain(existing), { state: 'warm', history: 'corrupt' }, 'the snapshot was not mutated');
}
{
  const h = helperHarness({ existing: 'corrupt' });
  const result = await updateSedimentStateWithOutcome({ nyxOutput: 'nyx', today: '2026-11-10', deps: h.deps });
  assert.deepEqual(plain(result.outcome), { code: 'preparation-error', message: 'state preparation failed before any write' });
  assert.equal(h.writes.length, 0, 'a malformed snapshot is not replaced');
}

assert.deepEqual(plain(await recordSleepPersistence(async () => {})), {
  code: 'confirmed',
  message: 'sleep result written',
});
assert.deepEqual(plain(await recordSleepPersistence(async () => { throw new Error('WRITE SECRET TEXT'); })), {
  code: 'write-unconfirmed',
  message: 'sleep result write did not confirm',
});

// ─── Route harness ───────────────────────────────────────────────────────────

const routeSource = compileTs(readFileSync('src/app/api/sleep/route.ts', 'utf8'));

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

function routeHarness(opts = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const docWrites = [];
  const docReads = [];
  const dreamAdds = [];
  const unexpected = [];
  const network = [];
  const puts = [];
  const dreamTriggers = [];
  const modelCalls = [];
  const completions = [];

  // Strict allowlist: any database path or operation the route does not need is
  // a violation, recorded before it throws.
  const allowedDocOps = new Set([
    'get plex_sediment/current',
    'set plex_sediment/current',
    'set plex_sleep/latest',
  ]);
  const allowedCollections = new Set(['dream_nodes']);
  const db = {
    doc(path) {
      const guard = (operation) => {
        const pair = `${operation} ${path}`;
        if (allowedDocOps.has(pair)) return;
        unexpected.push(`db ${pair}`);
        throw new Error(`unexpected db operation: ${pair}`);
      };
      return {
        async get() {
          guard('get');
          docReads.push(path);
          if (opts.readThrows) throw new Error('READ SECRET TEXT');
          return { exists: Boolean(opts.existing), data: () => opts.existing ?? {} };
        },
        async set(data, options) {
          guard('set');
          docWrites.push({ path, data, options });
          if (path === 'plex_sediment/current' && opts.stateWriteThrows) throw new Error('WRITE SECRET TEXT');
          if (path === 'plex_sleep/latest' && opts.sleepWriteThrows) throw new Error('WRITE SECRET TEXT');
        },
      };
    },
    collection(name) {
      if (!allowedCollections.has(name)) {
        unexpected.push(`db collection ${name}`);
        throw new Error(`unexpected db collection: ${name}`);
      }
      return {
        async add(data) {
          dreamAdds.push(data);
        },
      };
    },
  };

  const create = async (args) => {
    completions.push(args);
    const system = String(args?.messages?.[0]?.content ?? '');
    modelCalls.push(system);
    if (system.includes('emotional signature')) {
      return {
        choices: [{
          message: {
            content: JSON.stringify({ tone: 'warm', valence: 0.2, arousal: 0.3, whisper: 'a whisper' }),
          },
        }],
      };
    }
    if (system.includes('single most accurate emotional state word')) {
      if (opts.stateThrows) throw new Error('MODEL SECRET TEXT');
      return { choices: [{ message: { content: opts.completion ?? 'warm' } }] };
    }
    return { choices: [{ message: { content: opts.nyxOutput ?? 'NYX OUTPUT' } }] };
  };

  class Groq {
    constructor() {}
    get chat() {
      return { completions: { create } };
    }
  }

  const contentsPrefix = 'https://api.github.com/repos/Manitec/plex/contents/';
  const repoFiles = ['2026-01-01.md', '2026-01-02.md', 'nyx-2026-01-02.md'];

  // Strict URL/method allowlist: anything else is recorded, then thrown. Each
  // append reads its target file first, so today's targets are allowed for GET
  // as well as PUT.
  const todayPaths = ['plex', 'nyx', 'hex', ''].map(
    (prefix) => `sediment/${prefix ? `${prefix}-` : ''}${today}.md`,
  );
  const allowedNetwork = new Set([
    `GET ${contentsPrefix}sediment?ref=main`,
    `POST https://banjo.joesfaves.com/api/synthesize`,
    `POST https://plex.invalid/api/dream/run`,
    ...repoFiles.map((name) => `GET ${contentsPrefix}sediment/${name}?ref=main`),
    ...todayPaths.map((path) => `GET ${contentsPrefix}${path}?ref=main`),
    ...todayPaths.map((path) => `PUT ${contentsPrefix}${path}`),
  ]);

  const fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method ?? 'GET';
    const pair = `${method} ${target}`;
    network.push(pair);
    if (!allowedNetwork.has(pair)) {
      unexpected.push(pair);
      throw new Error(`unexpected fetch: ${pair}`);
    }
    if (target.startsWith(contentsPrefix)) {
      const path = decodeURIComponent(target.slice(contentsPrefix.length).split('?')[0]);
      if (method === 'GET') {
        if (path === 'sediment') {
          return jsonResponse(repoFiles.map((name) => ({ name, path: `sediment/${name}`, type: 'file' })));
        }
        if (path.startsWith('sediment/') && repoFiles.includes(path.slice('sediment/'.length))) {
          return jsonResponse({
            content: Buffer.from('EXISTING SEDIMENT').toString('base64'),
            sha: 'sha-existing',
            encoding: 'base64',
          });
        }
        return jsonResponse({ message: 'Not Found' }, 404);
      }
      puts.push({ path, body: JSON.parse(options.body) });
      return jsonResponse({ content: { sha: 'sha-next' } });
    }
    if (target.includes('banjo.joesfaves.com')) return jsonResponse({ synthesis: opts.hexOutput ?? 'HEX OUTPUT' });
    if (target.endsWith('/api/dream/run')) {
      dreamTriggers.push(`${method} ${target}`);
      return jsonResponse({ ok: true });
    }
    unexpected.push(pair);
    throw new Error(`unexpected fetch: ${pair}`);
  };

  const exports = {};
  vm.runInNewContext(routeSource, {
    exports,
    Buffer,
    URL,
    console: silentConsole,
    process: {
      env: {
        PLEX_SEDIMENT_TOKEN: 'token',
        CRON_SECRET: 'secret',
        NEXT_PUBLIC_SITE_URL: 'https://plex.invalid',
      },
    },
    require(name) {
      if (name === 'next/server') {
        return { NextResponse: { json: (data, options2) => ({ status: options2?.status ?? 200, data }) } };
      }
      if (name === 'groq-sdk') return { default: Groq };
      if (name === '@/lib/firebase-admin') return { getAdminDb: () => db };
      if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 'SERVER_TS' } };
      if (name === '@/lib/sleep-state') return helper;
      if (name === 'uuid') return { v4: () => 'mock-uuid' };
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch,
  });

  return {
    today,
    network,
    puts,
    dreamTriggers,
    unexpected,
    modelCalls,
    completions,
    docReads,
    docWrites,
    dreamAdds,
    stateWrites: () => docWrites.filter((write) => write.path === 'plex_sediment/current'),
    sleepWrites: () => docWrites.filter((write) => write.path === 'plex_sleep/latest'),
    async run(body = { mode: 'dreamless', source: 'manual' }) {
      return exports.POST({
        json: async () => body,
        headers: { get: (name) => (name === 'authorization' ? 'Bearer secret' : null) },
      });
    },
  };
}

const LEGACY_FIELDS = ['ok', 'date', 'mode', 'source', 'nyx', 'hex', 'plex_residue', 'sediment_state', 'log'];

function assertLegacyShape(data) {
  for (const field of LEGACY_FIELDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(data, field), true, `response must keep ${field}`);
  }
  assert.equal(typeof data.ok, 'boolean');
  assert.equal(typeof data.log, 'object');
}

// 1. Valid state update: bounded history, preserved fields, unchanged payload.
{
  const priorHistory = Array.from({ length: 25 }, (_, index) => ({
    state: `h${index}`,
    timestamp: `t${index}`,
    source: 'sleep',
  }));
  const h = routeHarness({
    existing: {
      state: 'warm',
      history: priorHistory,
      mood: 'moody',
      extra: 'keep me',
      pending: false,
    },
  });
  const res = await h.run();
  assert.equal(res.status, 200);
  assertLegacyShape(res.data);
  assert.equal(res.data.sediment_state, 'warm');
  assert.deepEqual(plain(res.data.state_outcome), { code: 'confirmed', message: 'state update confirmed' });
  assert.deepEqual(plain(res.data.sleep_persistence_outcome), { code: 'confirmed', message: 'sleep result written' });
  assert.ok(res.data.log.includes('step 7: firestore plex_sleep/latest written'));
  assert.ok(res.data.log.some((line) => line.includes('step 6: state') && line.includes('(confirmed)')));

  assert.equal(h.stateWrites().length, 1);
  const statePayload = h.stateWrites()[0].data;
  assert.equal(statePayload.state, 'warm');
  assert.equal(statePayload.sessionRef, h.today);
  assert.deepEqual(plain(h.stateWrites()[0].options), { merge: false });

  // Existing 20-entry cap, newest entry first, previous entries in order.
  assert.equal(statePayload.history.length, 20);
  assert.equal(statePayload.history[0].state, 'warm');
  assert.equal(statePayload.history[0].source, 'sleep');
  assert.deepEqual(plain(statePayload.history.slice(1)), priorHistory.slice(0, 19));

  // Unrelated fields on the stored document survive the update.
  assert.equal(statePayload.mood, 'moody');
  assert.equal(statePayload.extra, 'keep me');
  assert.equal(statePayload.note, `Derived from nightly pass — ${h.today}`);
  assert.equal(statePayload.pending, false);

  // The state extraction call keeps its existing sampling parameters.
  const stateCall = h.completions.find((call) =>
    String(call?.messages?.[0]?.content ?? '').includes('single most accurate emotional state word'));
  assert.ok(stateCall, 'the state completion was requested');
  assert.equal(stateCall.temperature, 0.3);
  assert.equal(stateCall.max_tokens, 10);

  // The latest-sleep document keeps its exact payload shape and excerpt limits.
  assert.deepEqual(plain(h.sleepWrites()[0].data), {
    date: h.today,
    mode: 'dreamless',
    nyx_excerpt: 'NYX OUTPUT',
    hex_excerpt: 'HEX OUTPUT',
    plex_residue: res.data.plex_residue,
    pending: true,
    createdAt: 'SERVER_TS',
  });
  assert.deepEqual(plain(h.sleepWrites()[0].options), { merge: false });

  assert.equal(h.dreamAdds.length, 1);
  assert.deepEqual(h.unexpected, []);
}

// 2. Empty completion: no state write, sleep still persisted, still 200.
{
  const h = routeHarness({ completion: '' });
  const res = await h.run();
  assert.equal(res.status, 200);
  assertLegacyShape(res.data);
  assert.equal(res.data.sediment_state, null);
  assert.deepEqual(plain(res.data.state_outcome), { code: 'empty-completion', message: 'empty state completion' });
  assert.deepEqual(plain(res.data.sleep_persistence_outcome), { code: 'confirmed', message: 'sleep result written' });
  assert.equal(h.stateWrites().length, 0);
  assert.equal(h.sleepWrites().length, 1);
  assert.ok(res.data.log.includes('step 7: firestore plex_sleep/latest written'));
  assert.deepEqual(h.unexpected, []);
}

// 3. Ambiguous prose keeps the existing rejected result.
{
  const h = routeHarness({ completion: 'not warm; unsettled' });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.equal(res.data.sediment_state, null);
  assert.deepEqual(plain(res.data.state_outcome), { code: 'invalid-state', message: 'completion held no accepted state' });
  assert.equal(JSON.stringify(res.data.state_outcome).includes('unsettled'), false);
  assert.equal(h.stateWrites().length, 0);
  assert.equal(h.sleepWrites().length, 1);
  assert.deepEqual(h.unexpected, []);
}

// 4. Model failure.
{
  const h = routeHarness({ stateThrows: true });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.deepEqual(plain(res.data.state_outcome), { code: 'model-error', message: 'state model call failed' });
  assert.equal(res.data.sediment_state, null);
  assert.equal(h.stateWrites().length, 0);
  assert.equal(h.sleepWrites().length, 1);
  assert.equal(JSON.stringify(res.data).includes('SECRET'), false);
  assert.deepEqual(h.unexpected, []);
}

// 5. Document read failure.
{
  const h = routeHarness({ readThrows: true });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.deepEqual(plain(res.data.state_outcome), { code: 'read-error', message: 'current state could not be read' });
  assert.equal(h.stateWrites().length, 0);
  assert.equal(h.sleepWrites().length, 1);
  assert.deepEqual(h.unexpected, []);
}

// 6. State write rejection: unconfirmed, not a definite failed save.
{
  const h = routeHarness({ stateWriteThrows: true });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.equal(res.data.sediment_state, null);
  assert.deepEqual(plain(res.data.state_outcome), { code: 'write-unconfirmed', message: 'state write did not confirm' });
  assert.equal(h.stateWrites().length, 1, 'the attempted write is recorded');
  assert.equal(h.sleepWrites().length, 1);
  assert.ok(res.data.log.includes('step 7: firestore plex_sleep/latest written'));
  assert.deepEqual(h.unexpected, []);
}

// 7. State success with sleep persistence rejection.
{
  const h = routeHarness({ sleepWriteThrows: true });
  const res = await h.run();
  assert.equal(res.status, 200);
  assertLegacyShape(res.data);
  assert.equal(res.data.sediment_state, 'warm');
  assert.deepEqual(plain(res.data.state_outcome), { code: 'confirmed', message: 'state update confirmed' });
  assert.deepEqual(plain(res.data.sleep_persistence_outcome), { code: 'write-unconfirmed', message: 'sleep result write did not confirm' });
  assert.ok(res.data.log.includes('step 7: firestore plex_sleep/latest unconfirmed'));
  assert.equal(res.data.log.some((line) => line.includes('plex_sleep/latest written')), false);
  assert.equal(h.stateWrites().length, 1);
  assert.equal(h.sleepWrites().length, 1);
  assert.deepEqual(h.unexpected, []);
}

// 8. Continuation through the dream decision, with no real trigger.
{
  const quiet = routeHarness();
  const quietRes = await quiet.run({ mode: 'dreamless', source: 'manual' });
  assert.equal(quietRes.status, 200);
  assert.deepEqual(quiet.dreamTriggers, []);
  assert.ok(quietRes.data.log.includes('step 8: dream trigger — skipped'));

  const dreaming = routeHarness();
  const dreamRes = await dreaming.run({ mode: 'dream', source: 'manual' });
  assert.equal(dreamRes.status, 200);
  assert.deepEqual(dreaming.dreamTriggers, ['POST https://plex.invalid/api/dream/run']);
  assert.ok(dreamRes.data.log.includes('step 8: dream trigger — fired'));
  assert.deepEqual(dreaming.unexpected, []);
}

// 9. Malformed snapshot/history: refused without repair; sleep persistence and
// the dream decision still run.
{
  const h = routeHarness({ existing: { state: 'warm', history: 'corrupt' } });
  const res = await h.run({ mode: 'dream', source: 'manual' });
  assert.equal(res.status, 200);
  assertLegacyShape(res.data);
  assert.equal(res.data.sediment_state, null);
  assert.deepEqual(plain(res.data.state_outcome), { code: 'preparation-error', message: 'state preparation failed before any write' });
  assert.deepEqual(plain(res.data.sleep_persistence_outcome), { code: 'confirmed', message: 'sleep result written' });
  assert.equal(h.stateWrites().length, 0, 'malformed history issues no write');
  assert.equal(h.sleepWrites().length, 1);
  assert.ok(res.data.log.includes('step 7: firestore plex_sleep/latest written'));
  assert.deepEqual(h.dreamTriggers, ['POST https://plex.invalid/api/dream/run']);
  assert.deepEqual(h.unexpected, []);
}

// 10. Excerpt limits on the sleep document, response and daily log are intact.
{
  const nyxLong = 'N'.repeat(500);
  const hexLong = 'H'.repeat(400);
  const h = routeHarness({ nyxOutput: nyxLong, hexOutput: hexLong });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.equal(res.data.nyx, nyxLong.slice(0, 200));
  assert.equal(res.data.hex, hexLong.slice(0, 200));

  const sleepPayload = h.sleepWrites()[0].data;
  assert.equal(sleepPayload.nyx_excerpt, nyxLong.slice(0, 280));
  assert.equal(sleepPayload.hex_excerpt, hexLong.slice(0, 280));

  const dailyLog = h.puts.find((put) => put.path === `sediment/${h.today}.md`);
  assert.ok(dailyLog, 'the daily log was written');
  const dailyText = Buffer.from(dailyLog.body.content, 'base64').toString('utf8');
  assert.ok(dailyText.includes(`nyx: "${'N'.repeat(120)}…"`));
  assert.ok(dailyText.includes(`hex: "${'H'.repeat(120)}…"`));
  assert.deepEqual(h.unexpected, []);
}

// The helper's own module must not have gained runtime imports.
assert.equal(/require\(/.test(compileTs(readFileSync('src/lib/sleep-state.ts', 'utf8'))), false);

silentConsole.log('sleep-state outcomes: all offline checks passed');
