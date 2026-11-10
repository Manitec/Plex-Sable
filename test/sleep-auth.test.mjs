// Offline, no-write authorization coverage for the sleep/dream secret bypass.
//
// Loads the REAL middleware and route sources (transpiled, sandboxed) with a
// strict dependency shim. No host environment is mutated and no host credential
// is required: every case receives its own isolated `process.env` object with
// PLEX_SEDIMENT_TOKEN absent. Any outbound fetch, unknown dependency, database
// access, or model-client construction is recorded and asserted empty, so a
// caught exception cannot hide it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Next 16 ships `next/server` as a CJS entry with no package exports map, so
// Node's ESM resolver cannot resolve the subpath; load it through CJS instead
// of substituting framework primitives.
const requireNext = createRequire(import.meta.url);
const { NextRequest, NextResponse } = requireNext('next/server');

const silentConsole = { info() {}, warn() {}, error() {}, log() {} };

function compileTs(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
}

const middlewareSource = compileTs(readFileSync('middleware.ts', 'utf8'));
const sleepSource = compileTs(readFileSync('src/app/api/sleep/route.ts', 'utf8'));
const dreamSource = compileTs(readFileSync('src/app/api/dream/run/route.ts', 'utf8'));
const sleepStateSource = compileTs(readFileSync('src/lib/sleep-state.ts', 'utf8'));

// The real pure helper module, loaded without any require shim.
const sleepState = {};
vm.runInNewContext(sleepStateSource, {
  exports: sleepState,
  module: { exports: sleepState },
  console: silentConsole,
});

const ALLOWED_DEPENDENCIES = new Set([
  'next/server',
  'groq-sdk',
  'uuid',
  'firebase-admin/firestore',
  '@/lib/firebase-admin',
  '@/lib/sleep-state',
]);

function makeHarness(env) {
  const counters = {
    requires: [],
    denied: [],
    network: [],
    dbAccess: 0,
    groqConstructed: 0,
  };

  class GroqStub {
    constructor() {
      counters.groqConstructed += 1;
    }
    get chat() {
      throw new Error('groq client used in an authorization test');
    }
  }

  const modules = {
    'next/server': { __esModule: true, NextRequest, NextResponse },
    'groq-sdk': { __esModule: true, default: GroqStub },
    'uuid': { __esModule: true, v4: () => 'uuid-test' },
    'firebase-admin/firestore': {
      __esModule: true,
      FieldValue: { serverTimestamp: () => 'SERVER_TS' },
    },
    '@/lib/firebase-admin': {
      __esModule: true,
      getAdminDb: () => {
        counters.dbAccess += 1;
        throw new Error('database access blocked in authorization tests');
      },
    },
    '@/lib/sleep-state': { __esModule: true, ...sleepState },
  };

  const shared = {
    Buffer,
    URL,
    console: silentConsole,
    process: { env },
    fetch: async (url) => {
      counters.network.push(String(url));
      throw new Error(`unexpected network call: ${url}`);
    },
    require(name) {
      counters.requires.push(name);
      if (!ALLOWED_DEPENDENCIES.has(name)) {
        counters.denied.push(name);
        throw new Error(`unexpected dependency: ${name}`);
      }
      return modules[name];
    },
  };

  function load(source) {
    const api = {};
    vm.runInNewContext(source, { ...shared, exports: api, module: { exports: api } });
    return api;
  }

  return {
    middleware: load(middlewareSource).middleware,
    sleep: load(sleepSource),
    dream: load(dreamSource),
    counters,
  };
}

function makeRequest(path, { method = 'GET', bearer, cookie, cronHeader, body } = {}) {
  const headers = new Headers();
  if (bearer !== undefined) headers.set('authorization', `Bearer ${bearer}`);
  if (cookie !== undefined) headers.set('cookie', `plex_sable_auth=${cookie}`);
  if (cronHeader) headers.set('x-vercel-cron', '1');
  if (body !== undefined) headers.set('content-type', 'application/json');

  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  return new NextRequest(`https://plex-sable.test${path}`, init);
}

function pickHandler(handlers, method) {
  return method === 'GET' ? handlers.GET : handlers.POST;
}

async function invoke({
  env,
  path = '/api/sleep',
  method = 'GET',
  direct = false,
  route = 'sleep',
  ...requestOptions
}) {
  const harness = makeHarness(env);
  const handlers = route === 'dream' ? harness.dream : harness.sleep;
  const request = makeRequest(path, { method, ...requestOptions });

  let response;
  if (direct) {
    response = await pickHandler(handlers, method)(request);
  } else {
    const middlewareResponse = await harness.middleware(request);
    response = middlewareResponse.status === 200
      ? await pickHandler(handlers, method)(request)
      : middlewareResponse;
  }

  const body = await response.json().catch(() => null);
  return { status: response.status, body, counters: harness.counters };
}

function check(label, result, status, error) {
  assert.equal(result.status, status, `${label}: status`);
  assert.deepEqual(result.body, { error }, `${label}: response body`);
  assert.deepEqual(result.counters.network, [], `${label}: no outbound network`);
  assert.deepEqual(result.counters.denied, [], `${label}: no denied dependency`);
  assert.equal(result.counters.dbAccess, 0, `${label}: no database access`);
  assert.equal(result.counters.groqConstructed, 0, `${label}: no model client constructed`);
}

// ─── Import purity: loading must not touch services or the network ───────────

{
  const harness = makeHarness({ NODE_ENV: 'test' });
  assert.equal(typeof harness.middleware, 'function');
  assert.equal(typeof harness.sleep.GET, 'function');
  assert.equal(typeof harness.sleep.POST, 'function');
  assert.equal(typeof harness.dream.GET, 'function');
  assert.equal(typeof harness.dream.POST, 'function');
  assert.ok(
    harness.counters.requires.every((name) => ALLOWED_DEPENDENCIES.has(name)),
    'every imported dependency is on the allowlist',
  );
  assert.deepEqual(harness.counters.denied, [], 'no unexpected imports at load time');
  assert.deepEqual(harness.counters.network, [], 'no network at load time');
  assert.equal(harness.counters.dbAccess, 0, 'no database access at load time');
  assert.equal(harness.counters.groqConstructed, 0, 'no model client at load time');
  assert.equal(harness.sleep.GET.length, 1, 'route exports the real GET handler');
}

// ─── A. Composed middleware -> route, /api/sleep ─────────────────────────────

const SECRET = 'test-cron-secret';
const SESSION = 'test-session-secret';
const base = (overrides = {}) => ({ NODE_ENV: 'test', ...overrides });

check(
  'A1 valid bearer GET',
  await invoke({ env: base({ CRON_SECRET: SECRET }), bearer: SECRET }),
  500,
  'no repo token',
);
check(
  'A2 GET without authorization',
  await invoke({ env: base({ CRON_SECRET: SECRET }) }),
  401,
  'Unauthorized',
);
check(
  'A3 GET with invalid bearer',
  await invoke({ env: base({ CRON_SECRET: SECRET }), bearer: 'wrong-secret' }),
  401,
  'Unauthorized',
);
check(
  'A4 GET with x-vercel-cron only',
  await invoke({ env: base({ CRON_SECRET: SECRET }), cronHeader: true }),
  401,
  'Unauthorized',
);
check(
  'A5 valid bearer POST',
  await invoke({ env: base({ CRON_SECRET: SECRET }), method: 'POST', bearer: SECRET }),
  500,
  'no repo token',
);
check(
  'A6 POST with session cookie only',
  await invoke({
    env: base({ CRON_SECRET: SECRET, PLEX_SESSION_SECRET: SESSION }),
    method: 'POST',
    cookie: SESSION,
  }),
  401,
  'unauthorized',
);
check(
  'A7 GET with session cookie only',
  await invoke({
    env: base({ CRON_SECRET: SECRET, PLEX_SESSION_SECRET: SESSION }),
    cookie: SESSION,
  }),
  401,
  'unauthorized',
);
check(
  'A8 GET with session cookie plus x-vercel-cron, no bearer',
  await invoke({
    env: base({ CRON_SECRET: SECRET, PLEX_SESSION_SECRET: SESSION }),
    cookie: SESSION,
    cronHeader: true,
  }),
  401,
  'unauthorized',
);
check(
  'A9 unset secret with empty bearer',
  await invoke({ env: base(), bearer: '' }),
  401,
  'Unauthorized',
);
check(
  'A10 explicitly empty secret with empty bearer',
  await invoke({ env: base({ CRON_SECRET: '' }), bearer: '' }),
  401,
  'Unauthorized',
);
check(
  'A11 explicitly empty secret with a bearer value',
  await invoke({ env: base({ CRON_SECRET: '' }), bearer: SECRET }),
  401,
  'Unauthorized',
);
check(
  'A12 path scope: bearer on another API path',
  await invoke({ env: base({ CRON_SECRET: SECRET }), path: '/api/other', bearer: SECRET }),
  401,
  'Unauthorized',
);

// ─── B. Direct route invocation, /api/sleep (no middleware) ──────────────────

check(
  'B1 direct POST with valid bearer',
  await invoke({ env: base({ CRON_SECRET: SECRET }), method: 'POST', bearer: SECRET, direct: true }),
  500,
  'no repo token',
);
check(
  'B2 direct POST without authorization',
  await invoke({ env: base({ CRON_SECRET: SECRET }), method: 'POST', direct: true }),
  401,
  'unauthorized',
);
check(
  'B3 direct POST with x-vercel-cron only, secret configured',
  await invoke({ env: base({ CRON_SECRET: SECRET }), method: 'POST', cronHeader: true, direct: true }),
  401,
  'unauthorized',
);
check(
  'B4 direct POST with x-vercel-cron only, secret unset, development',
  await invoke({
    env: base({ NODE_ENV: 'development' }),
    method: 'POST',
    cronHeader: true,
    direct: true,
  }),
  500,
  'no repo token',
);
check(
  'B5 direct POST with no headers, secret unset, development',
  await invoke({ env: base({ NODE_ENV: 'development' }), method: 'POST', direct: true }),
  500,
  'no repo token',
);
check(
  'B6 direct POST with no headers, secret unset, production',
  await invoke({ env: base({ NODE_ENV: 'production' }), method: 'POST', direct: true }),
  401,
  'unauthorized',
);
check(
  'B7 direct GET without authorization',
  await invoke({ env: base({ CRON_SECRET: SECRET }), direct: true }),
  401,
  'unauthorized',
);

// ─── C. /api/dream/run: POST-only secret bypass retained ─────────────────────

check(
  'C1 composed GET with valid bearer',
  await invoke({ env: base({ CRON_SECRET: SECRET }), path: '/api/dream/run', route: 'dream', bearer: SECRET }),
  401,
  'Unauthorized',
);
check(
  'C2 composed POST with valid bearer',
  await invoke({
    env: base({ CRON_SECRET: SECRET }),
    path: '/api/dream/run',
    method: 'POST',
    route: 'dream',
    bearer: SECRET,
  }),
  500,
  'no repo token',
);
check(
  'C3 composed POST with session cookie only',
  await invoke({
    env: base({ CRON_SECRET: SECRET, PLEX_SESSION_SECRET: SESSION }),
    path: '/api/dream/run',
    method: 'POST',
    route: 'dream',
    cookie: SESSION,
  }),
  401,
  'unauthorized',
);
check(
  'C4 composed POST with x-vercel-cron only',
  await invoke({
    env: base({ CRON_SECRET: SECRET }),
    path: '/api/dream/run',
    method: 'POST',
    route: 'dream',
    cronHeader: true,
  }),
  401,
  'Unauthorized',
);

// ─── D. Development fallback is unchanged with and without the header ────────

{
  const withoutHeader = await invoke({
    env: base({ NODE_ENV: 'development' }),
    method: 'POST',
    direct: true,
  });
  const withHeader = await invoke({
    env: base({ NODE_ENV: 'development' }),
    method: 'POST',
    cronHeader: true,
    direct: true,
  });

  check('D1 development fallback without header', withoutHeader, 500, 'no repo token');
  check('D2 development fallback with x-vercel-cron', withHeader, 500, 'no repo token');
  assert.equal(
    withHeader.status,
    withoutHeader.status,
    'the removed header shortcut changes nothing in development',
  );
  assert.deepEqual(withHeader.body, withoutHeader.body);
}
