// UI-side decisions for the ONE request queue.
//
// Kept out of the component so the rules can be tested directly:
//   - a failed refresh keeps the last known queue instead of replacing it with
//     an empty list, and is labelled stale;
//   - an action only counts as done when the server confirmed it.

export interface QueueSnapshot {
  requests: unknown[];
  stale: boolean;
  error: string | null;
}

export const STALE_QUEUE_NOTICE =
  'Request queue unavailable — showing the last known requests. They may be out of date.';

export function emptyQueue(): QueueSnapshot {
  return { requests: [], stale: false, error: null };
}

/** Did the queue read actually return a usable list? */
export function queueReadSucceeded(responseOk: boolean, payload: unknown): boolean {
  const body = (payload ?? null) as { requests?: unknown; requestsError?: unknown } | null;
  return (
    responseOk &&
    body !== null &&
    Array.isArray(body.requests) &&
    !body.requestsError
  );
}

export function applyQueueResponse(
  previous: unknown[],
  responseOk: boolean,
  payload: unknown,
): QueueSnapshot {
  if (!queueReadSucceeded(responseOk, payload)) {
    return { requests: previous, stale: true, error: STALE_QUEUE_NOTICE };
  }

  const body = payload as { requests: unknown[] };
  return { requests: body.requests, stale: false, error: null };
}

export type QueueAction = 'save' | 'delete';

export interface ActionFeedback {
  success: boolean;
  message: string;
}

export function interpretActionResponse(
  responseOk: boolean,
  payload: unknown,
  action: QueueAction,
): ActionFeedback {
  const body = (payload ?? null) as { ok?: unknown; error?: unknown } | null;

  if (responseOk && body !== null && body.ok === true) {
    return { success: true, message: '' };
  }

  const detail =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : 'the server did not confirm the change';

  return { success: false, message: `Could not ${action} this request — ${detail}.` };
}

/**
 * Every notice the queue panel should show, in a stable order.
 *
 * Both are returned rather than one replacing the other: a stale queue and a
 * failed action are separate facts, and hiding the stale warning behind the
 * action error would make the list look current when it is not.
 */
export function queueNotices(queue: QueueSnapshot, actionError: string | null): string[] {
  const notices: string[] = [];
  if (queue.error) notices.push(queue.error);
  if (actionError && actionError !== queue.error) notices.push(actionError);
  return notices;
}

export const REFRESH_AFTER_SAVE_NOTICE =
  'Saved — the request list could not be refreshed, so it may be out of date.';

/**
 * Message for a completed request action.
 *
 * A confirmed mutation whose follow-up read failed is not a failed mutation:
 * the change happened, only the refreshed view is in doubt.
 */
export function actionOutcomeNotice(
  mutationSucceeded: boolean,
  failureMessage: string,
  refreshSucceeded: boolean,
): string | null {
  if (!mutationSucceeded) {
    return failureMessage || 'The change was not confirmed by the server.';
  }
  if (!refreshSucceeded) return REFRESH_AFTER_SAVE_NOTICE;
  return null;
}

/**
 * `update_project` still answers `{ ok: true }` whether or not the write was
 * persisted, so attaching a request to a project can never be confirmed here.
 */
export const PROJECT_ATTACHMENT_UNVERIFIED =
  'Project attachment is unverified — the project note may not have been saved.';

export type ProjectAttachmentStage = 'project-unconfirmed' | 'request-unconfirmed';

export function projectAttachmentMessage(
  projectTitle: string,
  stage: ProjectAttachmentStage,
): string {
  if (stage === 'project-unconfirmed') {
    return `Could not confirm that ${projectTitle} was updated — the attachment is unverified. Check the project notes before retrying.`;
  }
  return `The request status could not be updated. The attachment to ${projectTitle} is unverified.`;
}
