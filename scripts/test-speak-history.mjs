import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync('src/app/api/speak/route.ts', 'utf8');
assert.match(source, /historySelection.kind === "stored"/, 'Route integration is required');
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
}
const silentConsole = { info() {}, warn() {}, error() {}, log() {} };
const helper = { exports: {} };
vm.runInNewContext(compile(readFileSync('src/lib/session-history.ts', 'utf8')), { exports: helper.exports });
// The route imports the extracted runtime, so load the REAL module here instead
// of substituting a permissive fake. It is transpiled exactly like the route and
// given only what it genuinely needs: Buffer, and stubs that fail loudly. Its
// sole import is `import type`, which the transpiler erases, so any require from
// it is a hard error rather than an arbitrary-module escape hatch.
const runtimeSource = compile(readFileSync('src/lib/plex-runtime.ts', 'utf8'));
assert.equal(/require\(/.test(runtimeSource), false, 'plex-runtime must have no runtime imports');
function loadRuntime(fetchImpl) {
  const api = {};
  vm.runInNewContext(runtimeSource, {
    exports: api,
    Buffer,
    URL,
    console: silentConsole,
    process: { env: {} },
    fetch: fetchImpl ?? (async (url) => {
      throw new Error(`Unexpected network call from plex-runtime: ${url}`);
    }),
    require(name) {
      throw new Error(`Unexpected import in plex-runtime: ${name}`);
    },
  });
  return api;
}
const smokeRuntime = loadRuntime();
assert.equal(typeof smokeRuntime.appendPlexFile, 'function', 'runtime must expose appendPlexFile');
assert.equal(typeof smokeRuntime.planTurnTools, 'function', 'runtime must expose planTurnTools');

// ─── Write-path fixtures ─────────────────────────────────────────────────────
// A recognized sediment-save offer, the daily path it targets, and an in-memory
// repository that speaks only the two GitHub contents URLs the runtime uses.
const OFFER = "If you'd like, I can note this moment in my sediment as 'Repair checkpoint — 2026-11-03' so we have a clear marker. Just let me know.";
const DAILY_PATH = 'sediment/2026-11-08.md';
const GITHUB_CONTENTS = 'https://api.github.com/repos/Manitec/plex/contents/';

function plain(content) {
  return { choices: [{ message: { content } }] };
}
function toolCall(name, args, id = 'call_1') {
  return { choices: [{ message: { content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] };
}

function fakeRepo(initial = {}) {
  const files = new Map(Object.entries(initial));
  const reads = [];
  const writes = [];
  const putAttempts = [];
  let failPut = false;
  const fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method ?? 'GET';
    const path = decodeURIComponent(target.slice(GITHUB_CONTENTS.length).split('?')[0]);
    if (method === 'GET') {
      reads.push(path);
      const file = files.get(path);
      if (file) {
        return {
          ok: true,
          status: 200,
          async json() { return { content: Buffer.from(file.content, 'utf8').toString('base64'), sha: file.sha, encoding: 'base64' }; },
        };
      }
      // Directory requests (context loading lists the sediment folder) get a
      // real listing of whatever the in-memory repository holds.
      const looksLikeDir = path === '' || !path.split('/').pop().includes('.');
      if (looksLikeDir) {
        const entries = [...files.keys()]
          .filter((candidate) => candidate.startsWith(path ? `${path}/` : ''))
          .map((candidate) => ({ name: candidate.split('/').pop(), path: candidate, type: 'file', sha: files.get(candidate).sha }));
        return { ok: true, status: 200, async json() { return entries; } };
      }
      return { ok: false, status: 404, async json() { return { message: 'Not Found' }; } };
    }
    assert.equal(method, 'PUT', `Unexpected method ${method} for ${target}`);
    putAttempts.push(path);
    if (failPut) throw new Error('mock PUT transport failure');
    const body = JSON.parse(options.body);
    const content = Buffer.from(body.content, 'base64').toString('utf8');
    writes.push({ path, content, message: body.message, sha: body.sha ?? null });
    files.set(path, { content, sha: `sha-${writes.length}` });
    return { ok: true, status: 200, async json() { return { content: { sha: `sha-${writes.length}` } }; } };
  };
  return { files, reads, writes, putAttempts, fetch, failPut() { failPut = true; } };
}

// Every outbound request is RECORDED before it is served. A target outside the
// fake repository is also thrown, but the recording is what makes the check
// reliable: production code catches fetch failures and turns them into write
// outcomes, so a swallowed error must still fail the scenario afterwards.
function wrapNetwork(inner, network) {
  return async (url, options = {}) => {
    const target = String(url);
    const method = options?.method ?? 'GET';
    network.requests.push(`${method} ${target}`);
    if ((method !== 'GET' && method !== 'PUT') || !target.startsWith(GITHUB_CONTENTS)) {
      network.unexpected.push(`${method} ${target}`);
      throw new Error(`Unexpected network call: ${method} ${target}`);
    }
    return inner(url, options);
  };
}

function assertNoUnexpected(network, label) {
  assert.deepEqual(network.unexpected, [], `${label}: unexpected network requests`);
}

// Proves the guard above cannot be defeated by a caught exception.
{
  const probe = { requests: [], unexpected: [] };
  const guarded = wrapNetwork(async () => ({ ok: true, status: 200, async json() { return {}; } }), probe);
  let threw = false;
  try { await guarded('https://example.invalid/elsewhere'); } catch { threw = true; }
  assert.equal(threw, true, 'the wrapper still throws for an unexpected target');
  assert.deepEqual(probe.unexpected, ['GET https://example.invalid/elsewhere'], 'an unexpected request is recorded even when the caller swallows the error');
}

// A token-bearing request loads repo context first; keep those reads in memory.
function withBaseContext(repo) {
  repo.files.set('prompts/base.md', { content: 'BASE PROMPT', sha: 'sha-base' });
  repo.files.set('plex-is.txt', { content: 'IDENTITY', sha: 'sha-is' });
  repo.files.set('plex-def.txt', { content: 'DEFINITION', sha: 'sha-def' });
  return repo;
}

function harness({ stored = [], failWrite = false, fallback = false, token = '', model = null, repository = null } = {}) {
  const state = { reads: 0, writes: [], calls: [], requestCreations: [] };
  const db = {
    doc(path) {
      if (path.startsWith('plex_sessions/')) return {
        async get() { state.reads++; return { exists: true, data: () => ({ messages: stored }) }; },
        async set(data) { if (failWrite) throw new Error('mock persistence failure'); state.writes.push(data); },
      };
      return { async get() { return { exists: false }; } };
    },
    collection(name) {
      // ONE queue writes are RECORDED, not swallowed: a blocked rescued action
      // must be provable, so a no-op stub would hide the side effect.
      const add = async (data) => { state.requestCreations.push({ collection: name, data }); };
      return { doc() { return { collection() { return { add }; } }; }, add };
    },
  };
  const repo = repository ?? fakeRepo();
  const network = { requests: [], unexpected: [] };
  let step = 0;
  const makeGroq = () => ({ chat: { completions: { async create(args) {
    state.calls.push(args);
    if (model) {
      const next = model[step++];
      if (!next) return plain('mock reply');
      if (next.throw) throw new Error(next.throw);
      // Steps may be a raw Groq response or a { text } / { response } shorthand.
      if (next.choices) return next;
      return next.response ?? plain(next.text ?? 'mock reply');
    }
    if (fallback && state.calls.length === 1) throw new Error('429 mock rate limit');
    return plain('mock reply');
  } } } });
  const runtimeApi = loadRuntime(wrapNetwork(repo.fetch, network));
  const exports = {};
  vm.runInNewContext(compile(source), {
    exports, Buffer, URL, console: silentConsole,
    process: { env: token ? { PLEX_SEDIMENT_TOKEN: token } : {} },
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (data, options) => ({ status: options?.status ?? 200, data }) } };
      if (name === '@/lib/firebase-admin') return { getAdminDb: () => db };
      if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 0 } };
      if (name === '@/lib/plex-identity') return { makeGroq };
      if (name === '@/lib/session-history') return helper.exports;
      if (name === '@/lib/plex-runtime') return runtimeApi;
      if (name === 'uuid') return { v4: () => 'mock-id' };
      if (name === 'groq-sdk') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
    async fetch(url, options) {
      const target = String(url);
      const method = options?.method ?? 'GET';
      if (/localhost:1234\/v1\/chat\/completions/.test(target)) {
        network.requests.push(`POST ${target}`);
        state.calls.push(JSON.parse(options.body));
        return { ok: true, async json() { return { choices: [{ message: { content: 'mock reply' } }] }; } };
      }
      // The route's own repo helpers run inside this sandbox, not the runtime.
      if (target.startsWith(GITHUB_CONTENTS)) return wrapNetwork(repo.fetch, network)(url, options);
      network.requests.push(`${method} ${target}`);
      network.unexpected.push(`${method} ${target}`);
      throw new Error(`Unexpected network call: ${method} ${target}`);
    },
  });
  return { state, repo, network, async send(body, voice = '') {
    return exports.POST({ json: async () => body, headers: new Headers({ host: 'localhost:3000' }), nextUrl: new URL(`https://example.invalid/api/speak${voice ? `?voice=${voice}` : ''}`) });
  } };
}
for (const override of [undefined, null]) {
  const h = harness({ stored: [{ role: 'assistant', content: 'earlier answer' }, { role: 'joe', content: 'earlier question' }] });
  const r = await h.send({ message: 'hello', overrideHistory: override });
  assert.equal(r.status, 200); assert.equal(h.state.reads, 1); assert.equal(h.state.writes.length, 1);
  assert.equal(h.state.calls[0].messages[1].role, 'assistant');
  assert.equal(h.state.calls[0].messages[2].role, 'user');
}
for (const override of [[], [{ role: 'assistant', content: 'prior reply' }, { role: 'joe', content: 'prior question' }]]) {
  const h = harness(); const r = await h.send({ message: 'hello', overrideHistory: override });
  assert.equal(r.status, 200); assert.equal(h.state.reads, 0); assert.equal(h.state.writes.length, 0);
}
for (const bad of [false, 0, 'bad', {}, [null], [{ role: 'system', content: 'x' }], [{ role: 'joe', content: 4 }]]) {
  const h = harness(); const r = await h.send({ message: 'hello', overrideHistory: bad });
  assert.equal(r.status, 400); assert.equal(h.state.reads, 0); assert.equal(h.state.writes.length, 0); assert.equal(h.state.calls.length, 0);
}
for (const provider of ['groq', 'lmstudio']) {
  const h = harness(); const r = await h.send({ message: 'hello', provider, overrideHistory: [{ role: 'assistant', content: 'prior reply' }] });
  assert.equal(r.status, 200); assert.equal(h.state.calls[0].messages[1].role, 'assistant');
}
{
  const h = harness({ fallback: true }); const r = await h.send({ message: 'hello', overrideHistory: [{ role: 'assistant', content: 'prior reply' }] });
  assert.equal(r.status, 200); assert.equal(r.data.fallback, true); assert.equal(h.state.calls[1].messages[1].role, 'assistant');
}
for (const voice of ['nyx', 'hex', 'mani']) {
  const h = harness(); const r = await h.send({ message: 'hello', overrideHistory: [{ role: 'assistant', content: 'prior reply' }] }, voice);
  assert.equal(r.status, 200); assert.equal(h.state.calls[0].messages[1].role, 'assistant'); assert.equal(h.state.reads, 0); assert.equal(h.state.writes.length, 0);
}
{
  const h = harness({ failWrite: true }); const r = await h.send({ message: 'hello' });
  assert.equal(r.status, 500); assert.equal(r.data.response, undefined);
}

// ─── Write-path integration through POST ─────────────────────────────────────
// 1. Follow-up acceptance offers only the write tool and appends to the daily file.
{
  const repo = fakeRepo({ [DAILY_PATH]: { content: 'OLD ENTRY', sha: 'sha-old' } });
  const h = harness({
    stored: [{ role: 'user', content: 'a hard day' }, { role: 'plex', content: OFFER }],
    model: [
      toolCall('write_plex_file', { path: DAILY_PATH, content: 'NEW ENTRY', message: 'checkpoint' }),
      { text: 'Noted. It is in the sediment now.' },
    ],
    repository: repo,
  });
  const r = await h.send({ message: 'Please do.' });
  assert.equal(r.status, 200);
  // Array.from keeps the comparison in this realm: the route builds `tools`
  // inside the vm context, so its Array prototype differs from ours.
  assert.deepEqual(Array.from(h.state.calls[0].tools, (t) => t.function.name), ['write_plex_file'], 'only the write tool is offered');
  assert.equal(h.state.calls[0].tool_choice, 'auto');
  assert.equal(repo.writes.length, 1, 'exactly one repository write');
  const saved = repo.files.get(DAILY_PATH).content;
  assert.ok(saved.startsWith('OLD ENTRY'), 'existing content is preserved');
  assert.ok(saved.includes('NEW ENTRY'), 'the new entry was appended');
  assert.ok(saved.indexOf('NEW ENTRY') > saved.indexOf('OLD ENTRY'));
  assert.equal(r.data.writeOutcomes.length, 1);
  assert.equal(r.data.writeOutcomes[0].status, 'confirmed');
  assert.equal(r.data.writeOutcomes[0].source, 'structured');
  assert.equal(r.data.writeOutcomes[0].path, DAILY_PATH);
  assertNoUnexpected(h.network, 'acceptance');
}

// 2a. Acceptance scope: a structured identity write is rejected with no I/O.
{
  const repo = fakeRepo();
  const h = harness({
    stored: [{ role: 'plex', content: OFFER }],
    model: [
      toolCall('write_plex_file', { path: 'plex-is.txt', content: 'AMENDMENT', message: 'identity' }),
      { text: 'I did not save that.' },
    ],
    repository: repo,
  });
  const r = await h.send({ message: 'Please do.' });
  assert.equal(r.status, 200);
  assert.equal(repo.putAttempts.length, 0, 'no repository write for an identity path');
  assert.equal(repo.writes.length, 0);
  assert.equal(r.data.writeOutcomes.length, 1);
  assert.equal(r.data.writeOutcomes[0].status, 'rejected');
  assert.equal(r.data.writeOutcomes[0].code, 'invalid-path');
  assertNoUnexpected(h.network, 'structured scope rejection');
}

// 2b. Acceptance scope: a rescued write to an unrelated path is rejected too.
{
  const repo = withBaseContext(fakeRepo());
  const h = harness({
    stored: [{ role: 'plex', content: OFFER }],
    token: 'dummy-token',
    model: [{ response: plain('<function=write_plex_file>{"path":"notes/scratch.md","content":"X"}</function>') }],
    repository: repo,
  });
  const r = await h.send({ message: 'Please do.' });
  assert.equal(r.status, 200);
  assert.equal(repo.putAttempts.length, 0, 'no repository write for an unrelated path');
  assert.equal(repo.writes.length, 0);
  assert.equal(r.data.writeOutcomes.length, 1);
  assert.equal(r.data.writeOutcomes[0].source, 'rescued');
  assert.equal(r.data.writeOutcomes[0].status, 'rejected');
  assert.equal(r.data.writeOutcomes[0].code, 'invalid-path');
  assert.equal(String(r.data.response).includes('<function='), false, 'the rescued call is stripped from the reply');
  assertNoUnexpected(h.network, 'rescued scope rejection');
}

// 3. A completed write survives total response-generation failure, reported once.
{
  const repo = fakeRepo({ [DAILY_PATH]: { content: 'OLD', sha: 'sha-old' } });
  const h = harness({
    stored: [{ role: 'plex', content: OFFER }],
    model: [
      toolCall('write_plex_file', { path: DAILY_PATH, content: 'ENTRY', message: 'checkpoint' }),
      { throw: '429 mock rate limit' },
      { throw: 'mock fallback unavailable' },
    ],
    repository: repo,
  });
  const r = await h.send({ message: 'Please do.' });
  assert.equal(r.status, 500);
  assert.equal(r.data.error, 'Plex unavailable');
  assert.equal(repo.writes.length, 1, 'the write completed before generation failed');
  assert.equal(r.data.writeOutcomes.length, 1, 'the confirmed outcome is reported exactly once');
  assert.equal(r.data.writeOutcomes[0].status, 'confirmed');
  assertNoUnexpected(h.network, 'generation failure after write');
}

// 4. A PUT transport failure is unknown, and it is not retried automatically.
{
  const repo = fakeRepo({ [DAILY_PATH]: { content: 'OLD', sha: 'sha-old' } });
  repo.failPut();
  const h = harness({
    stored: [{ role: 'plex', content: OFFER }],
    model: [
      toolCall('write_plex_file', { path: DAILY_PATH, content: 'ENTRY', message: 'checkpoint' }),
      { text: 'I am not certain it landed.' },
    ],
    repository: repo,
  });
  const r = await h.send({ message: 'Please do.' });
  assert.equal(r.status, 200);
  assert.equal(repo.putAttempts.length, 1, 'the PUT is attempted once, never retried');
  assert.equal(repo.writes.length, 0);
  assert.equal(r.data.writeOutcomes.length, 1);
  assert.equal(r.data.writeOutcomes[0].status, 'unknown');
  assert.equal(r.data.writeOutcomes[0].code, 'network');
  assertNoUnexpected(h.network, 'unknown persistence');
}

// 5. Ordinary text attempts no write and reports an empty outcome list.
{
  const repo = withBaseContext(fakeRepo());
  const h = harness({
    stored: [{ role: 'plex', content: OFFER }],
    token: 'dummy-token',
    model: [{ text: 'Nothing to save yet.' }],
    repository: repo,
  });
  const r = await h.send({ message: 'Please do.' });
  assert.equal(r.status, 200);
  assert.equal(r.data.writeOutcomes.length, 0, 'no outcome is invented');
  assert.equal(repo.writes.length, 0);
  assert.equal(repo.putAttempts.length, 0);
  assertNoUnexpected(h.network, 'no write attempted');
}

// 6. Acceptance must not enable a rescued submit_request side effect.
{
  const repo = withBaseContext(fakeRepo());
  const h = harness({
    stored: [{ role: 'plex', content: OFFER }],
    token: 'dummy-token',
    model: [{ response: plain('<function=submit_request>{"request":"promote me","notes":"n"}</function>') }],
    repository: repo,
  });
  const r = await h.send({ message: 'Please do.' });
  assert.equal(r.status, 200);
  assert.equal(
    h.state.requestCreations.filter((entry) => entry.collection === 'one_requests').length,
    0,
    'accepting a sediment offer must not create a ONE request'
  );
  assert.equal(repo.putAttempts.length, 0, 'a rescued submit_request writes nothing');
  assert.equal(repo.writes.length, 0);
  assert.equal(r.data.writeOutcomes.length, 0, 'no write outcome is invented');
  assert.equal(r.data.requestSubmitted, null);
  assert.equal(String(r.data.response).includes('<function='), false, 'the rescued call is stripped from the reply');
  assertNoUnexpected(h.network, 'rescued submit_request blocked');
}

console.log('Mocked speak history and write-path route checks passed; no real model or Firestore calls.');
