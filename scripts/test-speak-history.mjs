import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync('src/app/api/speak/route.ts', 'utf8');
assert.match(source, /historySelection.kind === "stored"/, 'Route integration is required');
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
}
const helper = { exports: {} };
vm.runInNewContext(compile(readFileSync('src/lib/session-history.ts', 'utf8')), { exports: helper.exports });
// The route imports the extracted runtime, so load the REAL module here instead
// of substituting a permissive fake. It is transpiled exactly like the route and
// given only what it genuinely needs: Buffer, and stubs that fail loudly. Its
// sole import is `import type`, which the transpiler erases, so any require from
// it is a hard error rather than an arbitrary-module escape hatch.
const runtimeSource = compile(readFileSync('src/lib/plex-runtime.ts', 'utf8'));
assert.equal(/require\(/.test(runtimeSource), false, 'plex-runtime must have no runtime imports');
function loadRuntime() {
  const api = {};
  const network = [];
  vm.runInNewContext(runtimeSource, {
    exports: api,
    Buffer,
    URL,
    console: { info() {}, warn() {}, error() {}, log() {} },
    process: { env: {} },
    fetch: async (url) => {
      network.push(String(url));
      throw new Error(`Unexpected network call from plex-runtime: ${url}`);
    },
    require(name) {
      throw new Error(`Unexpected import in plex-runtime: ${name}`);
    },
  });
  return { api, network };
}
const runtime = loadRuntime();
assert.equal(typeof runtime.api.appendPlexFile, 'function', 'runtime must expose appendPlexFile');
assert.equal(typeof runtime.api.planTurnTools, 'function', 'runtime must expose planTurnTools');
assert.equal(runtime.network.length, 0, 'loading the runtime must perform no I/O');
function harness({ stored = [], failWrite = false, fallback = false } = {}) {
  const state = { reads: 0, writes: [], calls: [] };
  const db = {
    doc(path) {
      if (path.startsWith('plex_sessions/')) return {
        async get() { state.reads++; return { exists: true, data: () => ({ messages: stored }) }; },
        async set(data) { if (failWrite) throw new Error('mock persistence failure'); state.writes.push(data); },
      };
      return { async get() { return { exists: false }; } };
    },
    collection() { return { doc() { return { collection() { return { async add() {} }; } }; }, async add() {} }; },
  };
  const makeGroq = () => ({ chat: { completions: { async create(args) {
    state.calls.push(args);
    if (fallback && state.calls.length === 1) throw new Error('429 mock rate limit');
    return { choices: [{ message: { content: 'mock reply' } }] };
  } } } });
  const exports = {};
  vm.runInNewContext(compile(source), {
    exports, Buffer, URL, console: { info() {}, warn() {}, error() {} },
    process: { env: {} },
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (data, options) => ({ status: options?.status ?? 200, data }) } };
      if (name === '@/lib/firebase-admin') return { getAdminDb: () => db };
      if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 0 } };
      if (name === '@/lib/plex-identity') return { makeGroq };
      if (name === '@/lib/session-history') return helper.exports;
      if (name === '@/lib/plex-runtime') return runtime.api;
      if (name === 'uuid') return { v4: () => 'mock-id' };
      if (name === 'groq-sdk') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
    async fetch(url, options) {
      assert.match(url, /localhost:1234\/v1\/chat\/completions/);
      state.calls.push(JSON.parse(options.body));
      return { ok: true, async json() { return { choices: [{ message: { content: 'mock reply' } }] }; } };
    },
  });
  return { state, async send(body, voice = '') {
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
console.log('Mocked speak history route checks passed; no real model or Firestore calls.');
