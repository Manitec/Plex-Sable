import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_REQUEST_ID_LENGTH,
  QUEUE_LIMIT,
  REQUEST_STATUSES,
  deleteRequest,
  isRequestStatus,
  isValidRequestId,
  readQueue,
  updateRequest,
} from '../src/lib/one-requests.ts';

/** In-memory stand-in for the Firestore-backed request store. */
function memoryStorage(initial = []) {
  const docs = new Map(initial.map(d => [d.id, { ...d }]));
  const calls = { list: 0, exists: 0, update: 0, remove: 0 };
  const storage = {
    docs,
    calls,
    failList: false,
    failExists: false,
    failUpdate: false,
    failRemove: false,
    async listRecent(limit) {
      calls.list += 1;
      if (storage.failList) throw new Error('firestore unavailable');
      return [...docs.values()].slice(0, limit);
    },
    async exists(id) {
      calls.exists += 1;
      if (storage.failExists) throw new Error('firestore unavailable');
      return docs.has(id);
    },
    async update(id, patch) {
      calls.update += 1;
      if (storage.failUpdate) throw new Error('write rejected');
      docs.set(id, { ...docs.get(id), ...patch });
    },
    async remove(id) {
      calls.remove += 1;
      if (storage.failRemove) throw new Error('delete rejected');
      docs.delete(id);
    },
  };
  return storage;
}

const seed = () => memoryStorage([
  { id: 'req_001', request: 'make music', source: 'plex', status: 'pending' },
]);

// ─── queue read: empty vs failed ────────────────────────────────────────────

test('successful empty queue is reported empty, with no error flag', async () => {
  const storage = memoryStorage();
  const result = await readQueue(storage);
  assert.deepEqual(result.requests, []);
  assert.equal(result.requestsError, undefined);
  assert.equal(storage.calls.list, 1);
});

test('failed queue read is reported as an error, not as an empty queue', async () => {
  const storage = memoryStorage();
  storage.failList = true;
  const result = await readQueue(storage);
  assert.deepEqual(result.requests, []);
  assert.equal(result.requestsError, 'unavailable');
});

test('populated queue is returned as stored', async () => {
  const storage = seed();
  const result = await readQueue(storage);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].id, 'req_001');
  assert.equal(result.requestsError, undefined);
});

test('queue read applies the documented limit', async () => {
  const storage = memoryStorage(
    Array.from({ length: QUEUE_LIMIT + 5 }, (_, i) => ({ id: `r${i}`, status: 'pending' })),
  );
  const result = await readQueue(storage);
  assert.equal(result.requests.length, QUEUE_LIMIT);
});

// ─── update ─────────────────────────────────────────────────────────────────

test('update succeeds and persists the requested status', async () => {
  const storage = seed();
  const outcome = await updateRequest(storage, { id: 'req_001', status: 'acknowledged' });
  assert.equal(outcome.httpStatus, 200);
  assert.equal(outcome.body.ok, true);
  assert.equal(storage.docs.get('req_001').status, 'acknowledged');
});

test('update of a missing document returns 404 and performs no write', async () => {
  const storage = memoryStorage();
  const outcome = await updateRequest(storage, { id: 'nope', status: 'done' });
  assert.equal(outcome.httpStatus, 404);
  assert.equal(outcome.body.ok, false);
  assert.equal(storage.calls.update, 0);
});

test('update write failure returns 500 and never reports success', async () => {
  const storage = seed();
  storage.failUpdate = true;
  const outcome = await updateRequest(storage, { id: 'req_001', status: 'done' });
  assert.equal(outcome.httpStatus, 500);
  assert.equal(outcome.body.ok, false);
  assert.equal(storage.docs.get('req_001').status, 'pending');
});

test('update existence-check failure returns 500, distinct from missing', async () => {
  const storage = seed();
  storage.failExists = true;
  const outcome = await updateRequest(storage, { id: 'req_001', status: 'done' });
  assert.equal(outcome.httpStatus, 500);
  assert.notEqual(outcome.httpStatus, 404);
  assert.equal(storage.calls.update, 0);
});

test('update rejects an unsupported status without touching storage', async () => {
  const storage = seed();
  const outcome = await updateRequest(storage, { id: 'req_001', status: 'archived' });
  assert.equal(outcome.httpStatus, 400);
  assert.equal(outcome.body.ok, false);
  assert.match(String(outcome.body.error), /unsupported status/);
  assert.equal(storage.calls.exists, 0);
  assert.equal(storage.calls.update, 0);
});

test('every supported status is accepted and persisted', async () => {
  for (const status of REQUEST_STATUSES) {
    const storage = seed();
    const outcome = await updateRequest(storage, { id: 'req_001', status });
    assert.equal(outcome.httpStatus, 200, `status ${status} should be accepted`);
    assert.equal(storage.docs.get('req_001').status, status);
  }
});

test('update rejects a missing id', async () => {
  const storage = seed();
  const outcome = await updateRequest(storage, { status: 'done' });
  assert.equal(outcome.httpStatus, 400);
  assert.match(String(outcome.body.error), /missing id/);
  assert.equal(storage.calls.exists, 0);
});

test('update rejects non-string notes', async () => {
  const storage = seed();
  const outcome = await updateRequest(storage, { id: 'req_001', status: 'done', notes: 42 });
  assert.equal(outcome.httpStatus, 400);
  assert.equal(storage.calls.update, 0);
});

test('update leaves notes untouched when they are omitted', async () => {
  const storage = memoryStorage([
    { id: 'req_001', status: 'pending', notes: 'original note' },
  ]);
  const outcome = await updateRequest(storage, { id: 'req_001', status: 'done' });
  assert.equal(outcome.httpStatus, 200);
  assert.equal(storage.docs.get('req_001').notes, 'original note');
});

// ─── delete ─────────────────────────────────────────────────────────────────

test('delete succeeds and removes the document', async () => {
  const storage = seed();
  const outcome = await deleteRequest(storage, { id: 'req_001' });
  assert.equal(outcome.httpStatus, 200);
  assert.equal(outcome.body.ok, true);
  assert.equal(storage.docs.has('req_001'), false);
});

test('delete of an already-absent document returns 404 and does not call remove', async () => {
  // Chosen behaviour: absence is checked explicitly rather than relying on
  // Firestore's idempotent delete() resolving successfully.
  const storage = memoryStorage();
  const outcome = await deleteRequest(storage, { id: 'gone' });
  assert.equal(outcome.httpStatus, 404);
  assert.equal(outcome.body.ok, false);
  assert.equal(storage.calls.remove, 0);
});

test('delete failure returns 500 and never reports success', async () => {
  const storage = seed();
  storage.failRemove = true;
  const outcome = await deleteRequest(storage, { id: 'req_001' });
  assert.equal(outcome.httpStatus, 500);
  assert.equal(outcome.body.ok, false);
  assert.equal(storage.docs.has('req_001'), true);
});

test('delete rejects a missing id', async () => {
  const storage = seed();
  const outcome = await deleteRequest(storage, {});
  assert.equal(outcome.httpStatus, 400);
  assert.equal(storage.calls.remove, 0);
});

// ─── vocabulary ─────────────────────────────────────────────────────────────

test('status vocabulary matches the existing UI filter list', () => {
  assert.deepEqual(
    [...REQUEST_STATUSES],
    ['pending', 'acknowledged', 'in-progress', 'done', 'deferred'],
  );
});

test('isRequestStatus rejects near-misses', () => {
  for (const bad of ['Pending', 'in progress', 'in_progress', '', 'DONE', null, undefined, 1]) {
    assert.equal(isRequestStatus(bad), false, `${String(bad)} should be rejected`);
  }
  for (const good of REQUEST_STATUSES) {
    assert.equal(isRequestStatus(good), true);
  }
});

// ─── single-document id validation ──────────────────────────────────────────

test('ids with path separators are rejected before touching storage', async () => {
  for (const bad of ['a/b', 'one_requests/x', '/leading', 'trailing/', 'a\\b']) {
    const storage = seed();
    const update = await updateRequest(storage, { id: bad, status: 'done' });
    assert.equal(update.httpStatus, 400, `update should reject ${bad}`);
    assert.equal(update.body.error, 'invalid request id');
    assert.equal(storage.calls.exists, 0, `update must not read storage for ${bad}`);
    assert.equal(storage.calls.update, 0);

    const remove = await deleteRequest(storage, { id: bad });
    assert.equal(remove.httpStatus, 400, `delete should reject ${bad}`);
    assert.equal(remove.body.error, 'invalid request id');
    assert.equal(storage.calls.exists, 0);
    assert.equal(storage.calls.remove, 0);
  }
});

test('dot segments are rejected', async () => {
  for (const bad of ['.', '..']) {
    assert.equal(isValidRequestId(bad), false);
    const storage = seed();
    const outcome = await deleteRequest(storage, { id: bad });
    assert.equal(outcome.httpStatus, 400);
    assert.equal(storage.calls.remove, 0);
  }
});

test('empty, non-string and oversized ids are rejected', async () => {
  for (const bad of ['', '   ', 42, null, undefined, {}, 'a'.repeat(MAX_REQUEST_ID_LENGTH + 1)]) {
    assert.equal(isValidRequestId(bad), false, `${String(bad)} should be invalid`);
  }
  const storage = seed();
  const outcome = await updateRequest(storage, { id: '   ', status: 'done' });
  assert.equal(outcome.httpStatus, 400);
  assert.equal(outcome.body.error, 'missing id');
});

test('a plain single-segment id is accepted and trimmed', async () => {
  assert.equal(isValidRequestId(' req_001 '), true);
  const storage = seed();
  const outcome = await updateRequest(storage, { id: ' req_001 ', status: 'done' });
  assert.equal(outcome.httpStatus, 200);
  assert.equal(storage.docs.get('req_001').status, 'done');
});
