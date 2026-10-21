import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync('src/app/api/one/session/route.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;

function harness({ count = 60, failRead = false, failUserWrite = false, failReplyWrite = false } = {}) {
  const stored = Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'plex' : 'joe', content: `turn-${i}`, createdAt: i }));
  const state = { calls: [], writes: [] };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, URL, Buffer, process: { env: {} }, console,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (data, options) => ({ status: options?.status ?? 200, data }) } };
      if (name === '@/lib/firebase') return { db: {} };
      if (name === 'firebase/firestore') return {
        collection: (_db, ...path) => ({ path }),
        doc: (_db, ...path) => ({ path }),
        query: (ref, ...constraints) => ({ ref, constraints }),
        orderBy: (field, direction) => ({ type: 'order', field, direction }),
        limit: n => ({ type: 'limit', n }),
        serverTimestamp: () => count + 1,
        async getDoc() { return { exists: () => true, data: () => ({ status: 'open' }) }; },
        async getDocs(q) {
          if (failRead) throw new Error('mock history read failure');
          const order = q.constraints.find(c => c.type === 'order');
          const bound = q.constraints.find(c => c.type === 'limit');
          let rows = [...stored].sort((a, b) => order?.direction === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
          if (bound) rows = rows.slice(0, bound.n);
          return { docs: rows.map((row, i) => ({ id: String(i), data: () => row })) };
        },
        async addDoc(ref, data) {
          state.writes.push({ ref, data });
          if (data.role === 'joe' && failUserWrite) throw new Error('mock user write failure');
          if (data.role === 'plex' && failReplyWrite) throw new Error('mock reply write failure');
          return { id: 'mock-message' };
        },
        async updateDoc() {},
      };
      throw new Error(`Unexpected import: ${name}`);
    },
    async fetch(url, options) {
      assert.match(url, /\/api\/speak$/);
      state.calls.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ response: 'mock reply' }) };
    },
  });
  return { state, async send() {
    return exports.POST({ json: async () => ({ action: 'message', sessionId: 'test-session', content: 'current-message' }), headers: new Headers() });
  } };
}

test('latest 40 prior messages reach speak in chronological order', async () => {
  const h = harness();
  const result = await h.send();
  assert.equal(result.status, 200);
  const prior = h.state.calls[0].overrideHistory.filter(m => m.content !== 'current-message');
  assert.deepEqual(Array.from(prior, m => m.content), Array.from({ length: 40 }, (_, i) => `turn-${i + 20}`));
});

test('current message is passed separately, not duplicated in overrideHistory', async () => {
  const h = harness();
  await h.send();
  assert.equal(h.state.calls[0].message, 'current-message');
  assert.equal(h.state.calls[0].overrideHistory.filter(m => m.content === 'current-message').length, 0);
});

test('history read failure stops before writes and inference', async () => {
  const h = harness({ failRead: true });
  const result = await h.send();
  assert.ok(result.status >= 400);
  assert.notEqual(result.data.ok, true);
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.calls.length, 0);
});

test('user-message save failure stops inference and reports failure', async () => {
  const h = harness({ failUserWrite: true });
  const result = await h.send();
  assert.ok(result.status >= 400);
  assert.notEqual(result.data.ok, true);
  assert.equal(h.state.calls.length, 0);
});

test('reply-save failure reports failure while retaining generated reply', async () => {
  const h = harness({ failReplyWrite: true });
  const result = await h.send();
  assert.ok(result.status >= 400);
  assert.notEqual(result.data.ok, true);
  assert.equal(result.data.plexReply, 'mock reply');
});
