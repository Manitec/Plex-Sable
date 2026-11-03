import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROJECT_ATTACHMENT_UNVERIFIED,
  REFRESH_AFTER_SAVE_NOTICE,
  STALE_QUEUE_NOTICE,
  actionOutcomeNotice,
  applyQueueResponse,
  emptyQueue,
  interpretActionResponse,
  projectAttachmentMessage,
  queueNotices,
  queueReadSucceeded,
} from '../src/lib/one-queue-state.ts';

const known = [{ id: 'req_001', status: 'pending' }];

// ─── refresh behaviour ──────────────────────────────────────────────────────

test('emptyQueue starts clean', () => {
  assert.deepEqual(emptyQueue(), { requests: [], stale: false, error: null });
});

test('successful empty queue replaces the previous list and is not stale', () => {
  const snapshot = applyQueueResponse(known, true, { requests: [] });
  assert.deepEqual(snapshot.requests, []);
  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.error, null);
});

test('successful refresh replaces the previous queue', () => {
  const fresh = [{ id: 'req_002', status: 'done' }];
  const snapshot = applyQueueResponse(known, true, { requests: fresh });
  assert.deepEqual(snapshot.requests, fresh);
  assert.equal(snapshot.stale, false);
});

test('failed refresh keeps the last known queue and marks it stale', () => {
  const snapshot = applyQueueResponse(known, false, { error: 'Unauthorized' });
  assert.deepEqual(snapshot.requests, known);
  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.error, STALE_QUEUE_NOTICE);
});

test('server read-failure flag keeps the last known queue', () => {
  const snapshot = applyQueueResponse(known, true, {
    requests: [],
    requestsError: 'unavailable',
  });
  assert.deepEqual(snapshot.requests, known, 'empty payload must not wipe the queue');
  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.error, STALE_QUEUE_NOTICE);
});

test('malformed payload does not clear the queue', () => {
  for (const payload of [null, undefined, {}, { requests: 'nope' }, 'text']) {
    const snapshot = applyQueueResponse(known, true, payload);
    assert.deepEqual(snapshot.requests, known, `payload ${JSON.stringify(payload)}`);
    assert.equal(snapshot.stale, true);
  }
});

// ─── action feedback ────────────────────────────────────────────────────────

test('action only counts as done when the server confirms ok', () => {
  assert.deepEqual(interpretActionResponse(false, { ok: true }, 'save'), {
    success: false,
    message: 'Could not save this request — the server did not confirm the change.',
  });
  assert.equal(interpretActionResponse(true, { ok: true }, 'save').success, true);
  assert.equal(interpretActionResponse(true, { ok: true }, 'delete').message, '');
});

test('action failure surfaces the server detail', () => {
  const feedback = interpretActionResponse(false, { ok: false, error: 'request not found' }, 'delete');
  assert.equal(feedback.success, false);
  assert.match(feedback.message, /request not found/);
  assert.match(feedback.message, /delete/);
});

test('a 200 without ok:true is still a failure', () => {
  const feedback = interpretActionResponse(true, { requests: [] }, 'save');
  assert.equal(feedback.success, false);
  assert.match(feedback.message, /did not confirm/);
});

test('network failure with no payload is a failure', () => {
  const feedback = interpretActionResponse(false, null, 'save');
  assert.equal(feedback.success, false);
  assert.match(feedback.message, /Could not save this request/);
});

test('empty error string falls back to the generic message', () => {
  const feedback = interpretActionResponse(false, { ok: false, error: '   ' }, 'delete');
  assert.match(feedback.message, /did not confirm/);
});

// ─── read success predicate ─────────────────────────────────────────────────

test('queueReadSucceeded distinguishes empty from unreadable', () => {
  assert.equal(queueReadSucceeded(true, { requests: [] }), true);
  assert.equal(queueReadSucceeded(true, { requests: [], requestsError: 'unavailable' }), false);
  assert.equal(queueReadSucceeded(false, { requests: [] }), false);
  assert.equal(queueReadSucceeded(true, null), false);
  assert.equal(queueReadSucceeded(true, { requests: 'nope' }), false);
});

// ─── notices: stale warning and action error coexist ────────────────────────

test('stale warning and action error are both shown', () => {
  const stale = { requests: [], stale: true, error: STALE_QUEUE_NOTICE };
  const notices = queueNotices(stale, 'Could not delete this request — request not found.');
  assert.equal(notices.length, 2);
  assert.equal(notices[0], STALE_QUEUE_NOTICE);
  assert.equal(notices[1], 'Could not delete this request — request not found.');
});

test('either notice alone is reported alone', () => {
  const fresh = { requests: [], stale: false, error: null };
  const stale = { requests: [], stale: true, error: STALE_QUEUE_NOTICE };
  assert.deepEqual(queueNotices(fresh, 'boom'), ['boom']);
  assert.deepEqual(queueNotices(stale, null), [STALE_QUEUE_NOTICE]);
  assert.deepEqual(queueNotices(fresh, null), []);
});

// ─── saved vs refresh-failed ────────────────────────────────────────────────

test('a saved action with a failed refresh is not reported as a failure', () => {
  const notice = actionOutcomeNotice(true, '', false);
  assert.equal(notice, REFRESH_AFTER_SAVE_NOTICE);
  assert.doesNotMatch(notice, /Could not save/);
});

test('a failed mutation keeps its own failure message', () => {
  const notice = actionOutcomeNotice(false, 'Could not save this request — server down.', true);
  assert.equal(notice, 'Could not save this request — server down.');
});

test('a saved action with a successful refresh needs no notice', () => {
  assert.equal(actionOutcomeNotice(true, '', true), null);
});

// ─── project attachment wording ─────────────────────────────────────────────

test('project attachment messages never claim the write happened', () => {
  const unconfirmed = projectAttachmentMessage('Alpha', 'project-unconfirmed');
  const requestFailed = projectAttachmentMessage('Alpha', 'request-unconfirmed');

  for (const message of [unconfirmed, requestFailed]) {
    assert.doesNotMatch(message, /Nothing was changed/i);
    assert.doesNotMatch(message, /was added/i);
    assert.match(message, /unverified/i);
    assert.match(message, /Alpha/);
  }
  assert.match(PROJECT_ATTACHMENT_UNVERIFIED, /unverified/i);
});
