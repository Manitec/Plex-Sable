// Offline coverage for the sanitized sleep diagnostic runtime event.
//
// The real route module is transpiled and executed in a vm sandbox with
// controlled stubs for Groq, GitHub contents, Banjo, the dream runner and
// Firestore. Nothing contacts a real network or service; every external call is
// answered by a local stub. Unexpected database operations, URL/method pairs and
// imports are recorded *before* they throw, and each completed case asserts the
// record is empty, so a caught exception cannot hide denied access.
//
// The host environment is never read or mutated: the sandbox receives its own
// process.env object.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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

// Real sleep-state module, loaded with an isolated environment.
const helper = {};
vm.runInNewContext(compileTs(readFileSync('src/lib/sleep-state.ts', 'utf8')), {
  exports: helper,
  Buffer,
  URL,
  console: { info() {}, warn() {}, error() {}, log() {} },
  process: { env: {} },
});

const routeSource = compileTs(readFileSync('src/app/api/sleep/route.ts', 'utf8'));

// The reduced contract: exactly these seven keys, nothing else.
const EVENT_KEYS = [
  'event',
  'version',
  'date',
  'mode',
  'source',
  'state_outcome',
  'sleep_persistence_outcome',
];

// Fields the earlier proposal carried, plus any free-form surface that must not
// enter the event.
const FORBIDDEN_EVENT_KEYS = [
  'state',
  'weave',
  'dreaming',
  'message',
  'error',
  'excerpt',
  'prompt',
  'history',
  'header',
  'headers',
  'authorization',
  'body',
  'log',
];

const SENSITIVE_MARKERS = [
  'NYX PRIVATE PROSE',
  'HEX PRIVATE PROSE',
  'MODEL SECRET TEXT',
  'WRITE SECRET TEXT',
  'RESIDUE PRIVATE TEXT',
  'Bearer',
  'CRON_SECRET',
  'SEDIMENT_TOKEN',
];

// Response keys from the merged revision. The diagnostic event must not appear
// here, and no existing field may be added, removed or renamed.
const RESPONSE_KEYS = [
  'ok',
  'date',
  'mode',
  'source',
  'nyx',
  'hex',
  'plex_residue',
  'sediment_state',
  'state_outcome',
  'sleep_persistence_outcome',
  'log',
];

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
  const events = [];
  const docWrites = [];
  const docReads = [];
  const dreamAdds = [];
  const unexpected = [];
  const unexpectedImports = [];
  const network = [];
  const puts = [];
  const dreamTriggers = [];
  const completions = [];

  const recordingConsole = {
    info: (...args) => { events.push(args); },
    warn() {},
    error() {},
    log() {},
  };

  // Strict allowlist: any database path/operation the route does not need is a
  // violation, recorded before it throws.
  const allowedDocOps = new Set([
    'get plex_sediment/current',
    'get plex_sleep/latest',
    'set plex_sediment/current',
    'set plex_sleep/latest',
  ]);
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
          if (path === 'plex_sediment/current' && opts.stateWriteThrows) {
            throw new Error('WRITE SECRET TEXT');
          }
          if (path === 'plex_sleep/latest' && opts.sleepWriteThrows) {
            throw new Error('WRITE SECRET TEXT');
          }
        },
      };
    },
    collection(name) {
      if (name !== 'dream_nodes') {
        unexpected.push(`db collection ${name}`);
        throw new Error(`unexpected db collection: ${name}`);
      }
      return {
        async add(data) { dreamAdds.push(data); },
      };
    },
  };

  const create = async (args) => {
    completions.push(args);
    const system = String(args?.messages?.[0]?.content ?? '');
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
    if (opts.nyxThrows) throw new Error('MODEL SECRET TEXT');
    return { choices: [{ message: { content: opts.nyxOutput ?? 'NYX PRIVATE PROSE' } }] };
  };

  class Groq {
    constructor() {}
    get chat() {
      return { completions: { create } };
    }
  }

  const contentsPrefix = 'https://api.github.com/repos/Manitec/plex/contents/';
  const repoFiles = ['2026-01-01.md', '2026-01-02.md', 'nyx-2026-01-02.md'];
  const todayPaths = ['plex', 'nyx', 'hex', ''].map(
    (prefix) => `sediment/${prefix ? `${prefix}-` : ''}${today}.md`,
  );
  const allowedNetwork = new Set([
    `GET ${contentsPrefix}sediment?ref=main`,
    'POST https://banjo.joesfaves.com/api/synthesize',
    'POST https://plex.invalid/api/dream/run',
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
          return jsonResponse(repoFiles.map((name) => ({
            name,
            path: `sediment/${name}`,
            type: 'file',
          })));
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
    if (target.includes('banjo.joesfaves.com')) {
      return jsonResponse({ synthesis: opts.hexOutput ?? 'HEX PRIVATE PROSE' });
    }
    if (target.endsWith('/api/dream/run')) {
      dreamTriggers.push(pair);
      return jsonResponse({ ok: true });
    }
    unexpected.push(pair);
    throw new Error(`unexpected fetch: ${pair}`);
  };

  const env = {
    PLEX_SEDIMENT_TOKEN: 'SEDIMENT_TOKEN_VALUE',
    CRON_SECRET: 'secret',
    NEXT_PUBLIC_SITE_URL: 'https://plex.invalid',
    ...(opts.env ?? {}),
  };

  const exports = {};
  vm.runInNewContext(routeSource, {
    exports,
    Buffer,
    URL,
    console: recordingConsole,
    process: { env },
    require(name) {
      if (name === 'next/server') {
        return { NextResponse: { json: (data, init) => ({ status: init?.status ?? 200, data }) } };
      }
      if (name === 'groq-sdk') return { default: Groq };
      if (name === '@/lib/firebase-admin') return { getAdminDb: () => db };
      if (name === 'firebase-admin/firestore') {
        return { FieldValue: { serverTimestamp: () => 'SERVER_TS' } };
      }
      if (name === '@/lib/sleep-state') return helper;
      if (name === 'uuid') return { v4: () => 'mock-uuid' };
      unexpectedImports.push(name);
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch,
  });

  return {
    today,
    events,
    network,
    puts,
    dreamTriggers,
    unexpected,
    unexpectedImports,
    docReads,
    docWrites,
    dreamAdds,
    completions,
    stateWrites: () => docWrites.filter((write) => write.path === 'plex_sediment/current'),
    sleepWrites: () => docWrites.filter((write) => write.path === 'plex_sleep/latest'),
    async run(body = { mode: 'dreamless', source: 'manual' }) {
      const authorization = opts.authorized === false ? null : 'Bearer secret';
      return exports.POST({
        json: async () => body,
        headers: { get: (name) => (name === 'authorization' ? authorization : null) },
      });
    },
  };
}

function assertNoDeniedAccess(h) {
  assert.deepEqual(h.unexpected, [], 'no unexpected database or network access');
  assert.deepEqual(h.unexpectedImports, [], 'no unexpected dependency access');
  for (const pair of h.network) {
    assert.ok(pair.includes('api.github.com') || pair.includes('banjo') || pair.includes('plex.invalid'),
      `network pair stayed inside the allowlist: ${pair}`);
  }
}

function assertEventShape(event, expected) {
  assert.deepEqual(Object.keys(event).sort(), [...EVENT_KEYS].sort());
  assert.equal(event.event, 'sleep.diagnostics');
  assert.equal(event.version, 1);
  assert.equal(typeof event.date, 'string');
  for (const key of FORBIDDEN_EVENT_KEYS) {
    assert.equal(Object.hasOwn(event, key), false, `event must not carry ${key}`);
  }
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(event[key], value, `unexpected ${key}`);
  }
  const serialized = JSON.stringify(event);
  for (const marker of SENSITIVE_MARKERS) {
    assert.equal(serialized.includes(marker), false, `event leaked ${marker}`);
  }
}

function assertResponseUnchanged(res) {
  assert.deepEqual(Object.keys(res.data).sort(), [...RESPONSE_KEYS].sort());
  assert.equal(Object.hasOwn(res.data, 'event'), false);
  assert.equal(Object.hasOwn(res.data, 'diagnostics'), false);
}

function assertSleepPayloadUnchanged(h, res) {
  assert.deepEqual(plain(h.sleepWrites()[0].data), {
    date: h.today,
    mode: 'dreamless',
    nyx_excerpt: 'NYX PRIVATE PROSE',
    hex_excerpt: 'HEX PRIVATE PROSE',
    plex_residue: res.data.plex_residue,
    pending: true,
    createdAt: 'SERVER_TS',
  });
  assert.deepEqual(plain(h.sleepWrites()[0].options), { merge: false });
}

// 1. Confirmed state write and confirmed sleep persistence: one event, exact
//    seven-key shape, normalized values, unchanged response and payloads.
{
  const h = routeHarness({ existing: { state: 'warm', history: [] } });
  const res = await h.run({ mode: 'dreamless', source: 'manual' });
  assert.equal(res.status, 200);
  assert.equal(h.events.length, 1, 'exactly one diagnostic event per invocation');
  assert.equal(h.events[0][0], '[sleep-diag]');
  const event = plain(h.events[0][1]);
  assertEventShape(event, {
    date: h.today,
    mode: 'dreamless',
    source: 'manual',
    state_outcome: 'confirmed',
    sleep_persistence_outcome: 'confirmed',
  });
  assertResponseUnchanged(res);
  assert.equal(res.data.state_outcome.code, 'confirmed');
  assert.equal(res.data.sleep_persistence_outcome.code, 'confirmed');
  assertSleepPayloadUnchanged(h, res);
  assert.equal(h.stateWrites().length, 1);
  assert.equal(h.stateWrites()[0].data.state, 'warm');
  assert.equal(h.stateWrites()[0].data.sessionRef, h.today);
  assertNoDeniedAccess(h);
}

// 2. Runtime normalization: an out-of-range mode/source is clamped before the
//    event is built, so the event only ever carries allowlisted values.
{
  const h = routeHarness({ existing: { state: 'warm', history: [] } });
  const res = await h.run({ mode: 'not-a-mode', source: 'not-a-source' });
  assert.equal(res.status, 200);
  assert.equal(h.events.length, 1);
  const event = plain(h.events[0][1]);
  assertEventShape(event, { mode: 'dream', source: 'cron' });
  assert.equal(res.data.mode, 'dream');
  assert.equal(res.data.source, 'cron');
  assertNoDeniedAccess(h);
}

// 3. State model error: the event reports the failure and the sleep document
//    still persists independently.
{
  const h = routeHarness({ stateThrows: true, existing: { state: 'warm', history: [] } });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.equal(h.events.length, 1);
  const event = plain(h.events[0][1]);
  assertEventShape(event, {
    state_outcome: 'model-error',
    sleep_persistence_outcome: 'confirmed',
  });
  assertResponseUnchanged(res);
  assert.equal(res.data.sediment_state, null);
  assert.equal(h.stateWrites().length, 0);
  assert.equal(h.sleepWrites().length, 1);
  assertNoDeniedAccess(h);
}

// 4. Sleep-document write rejection: unconfirmed persistence is reported while
//    the confirmed state is still visible.
{
  const h = routeHarness({ sleepWriteThrows: true, existing: { state: 'warm', history: [] } });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.equal(h.events.length, 1);
  const event = plain(h.events[0][1]);
  assertEventShape(event, {
    state_outcome: 'confirmed',
    sleep_persistence_outcome: 'write-unconfirmed',
  });
  assertResponseUnchanged(res);
  assert.equal(h.sleepWrites().length, 1, 'the attempted write is recorded');
  assertNoDeniedAccess(h);
}

// 5. Both failures in one run: exactly one event carries both codes, and no
//    outcome message or exception text rides along.
{
  const h = routeHarness({
    stateThrows: true,
    sleepWriteThrows: true,
    existing: { state: 'warm', history: [] },
  });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.equal(h.events.length, 1);
  const event = plain(h.events[0][1]);
  assertEventShape(event, {
    state_outcome: 'model-error',
    sleep_persistence_outcome: 'write-unconfirmed',
  });
  assert.equal(JSON.stringify(event).includes('SECRET'), false);
  assertNoDeniedAccess(h);
}

// 6. Sensitive-marker exclusion: private prose, exceptions, credentials and
//    request material never reach the event, and no free-form key appears.
{
  const h = routeHarness({
    nyxOutput: 'NYX PRIVATE PROSE',
    hexOutput: 'HEX PRIVATE PROSE',
    sleepWriteThrows: true,
    existing: { state: 'warm', history: [] },
  });
  const res = await h.run();
  assert.equal(res.status, 200);
  assert.equal(h.events.length, 1);
  const event = plain(h.events[0][1]);
  assertEventShape(event, { sleep_persistence_outcome: 'write-unconfirmed' });
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes('NYX PRIVATE PROSE'), false);
  assert.equal(serialized.includes('HEX PRIVATE PROSE'), false);
  assert.equal(serialized.includes('WRITE SECRET TEXT'), false);
  assert.equal(serialized.includes('SEDIMENT_TOKEN_VALUE'), false);
  assert.equal(serialized.includes('secret'), false);
  assertNoDeniedAccess(h);
}

// 7. Documented early exits emit no diagnostic event at all.
{
  const unauthorized = routeHarness({ authorized: false, existing: { state: 'warm', history: [] } });
  const unauthorizedRes = await unauthorized.run();
  assert.equal(unauthorizedRes.status, 401);
  assert.equal(unauthorized.events.length, 0);
  assertNoDeniedAccess(unauthorized);
}
{
  const noToken = routeHarness({ env: { PLEX_SEDIMENT_TOKEN: '' }, existing: { state: 'warm', history: [] } });
  const noTokenRes = await noToken.run();
  assert.equal(noTokenRes.status, 500);
  assert.deepEqual(plain(noTokenRes.data), { error: 'no repo token' });
  assert.equal(noToken.events.length, 0);
  assertNoDeniedAccess(noToken);
}
{
  // A Nyx-pass model failure throws before the state/sleep-document stage; the
  // route has no catch there, so it emits nothing. This is the documented blind
  // spot, not a behavior this patch changes.
  const h = routeHarness({ nyxThrows: true, existing: { state: 'warm', history: [] } });
  await assert.rejects(() => h.run());
  assert.equal(h.events.length, 0);
  assert.equal(h.stateWrites().length, 0);
  assert.equal(h.sleepWrites().length, 0);
  assertNoDeniedAccess(h);
}

// 8. The diagnostic is a completion-stage event only: it does not run for the
//    separate clear_sleep action (which returns before any processing).
{
  const h = routeHarness({ existing: { state: 'warm', history: [] } });
  const res = await h.run({ action: 'clear_sleep' });
  assert.equal(res.status, 200);
  assert.equal(res.data.action, 'clear_sleep');
  assert.equal(h.events.length, 0);
  assertNoDeniedAccess(h);
}

// The event object is constructed from the existing outcome unions, so only the
// defined codes can appear.
const { STATE_OUTCOMES, SLEEP_PERSISTENCE_OUTCOMES } = helper;
assert.deepEqual(Object.keys(STATE_OUTCOMES).sort(), [
  'confirmed',
  'empty-completion',
  'invalid-state',
  'model-error',
  'preparation-error',
  'read-error',
  'write-unconfirmed',
]);
assert.deepEqual(Object.keys(SLEEP_PERSISTENCE_OUTCOMES).sort(), ['confirmed', 'write-unconfirmed']);

process.stdout.write('sleep diagnostics: all offline checks passed\n');
