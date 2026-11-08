// Acceptance-gate tests: a short "yes" to an immediately preceding, unambiguous
// offer to append a SEDIMENT entry. Offline, invented inputs only.
//
// These exercise the pure planner and matcher. They do not execute the route,
// call a model, or write anything; route wiring stays source-reviewed.

import test from "node:test";
import assert from "node:assert/strict";

import {
  isDailySedimentPath,
  isSedimentOfferAcceptance,
  planTurnTools,
  SAVE_ACCEPTANCE_TOOL_NAME,
  shouldUseTools,
} from "../src/lib/plex-runtime.ts";

const TOOL_NAMES = [
  "read_plex_file",
  "write_plex_file",
  "list_plex_dir",
  "recall",
  "submit_request",
  "read_one_requests",
  "web_search",
  "think_deeply",
];

const plex = (content) => ({ role: "plex", content });
const user = (content) => ({ role: "user", content });

// The actual reported offer, as a synthetic equivalent.
const REPORTED_OFFER =
  "Thank you for the update. If you'd like, I can note this moment in my sediment as 'Repair checkpoint — example date' so we have a clear marker. Just let me know.";

const PLAIN_OFFER = "I can note this moment in my sediment.";

function plan(message, history) {
  return planTurnTools({
    message,
    mode: "relational",
    fileRequest: null,
    history,
    availableNames: TOOL_NAMES,
  });
}

function acceptance(message, offer, role = "plex") {
  return isSedimentOfferAcceptance(message, [{ role, content: offer }]);
}

test("acceptance: the reported offer enables only the sediment write tool", () => {
  const expected = {
    kind: "sediment-acceptance",
    names: [SAVE_ACCEPTANCE_TOOL_NAME],
    writeScope: "daily-sediment",
  };

  for (const reply of ["Please do.", "yes", "go ahead"]) {
    assert.deepEqual(plan(reply, [user("here is the update"), plex(REPORTED_OFFER)]), expected, reply);
  }

  // Polite "if you'd like" wording and a quoted entry title are not disqualifying.
  assert.equal(acceptance("Please do.", REPORTED_OFFER), true);
});

test("acceptance: an offer-shaped sentence that is not a sediment offer stays closed", () => {
  assert.deepEqual(plan("yes", [plex("I can save you time on this.")]), { kind: "none" });
  assert.equal(acceptance("yes", "I can save you time on this."), false);
});

test("acceptance: a quoted or code-block offer is an example, not an offer", () => {
  assert.equal(acceptance("yes", 'She told me: "I can note this in my sediment."'), false);
  assert.equal(acceptance("yes", "You suggested, 'I can note this in my sediment.'"), false);
  assert.equal(acceptance("yes", "```\nI can note this in my sediment.\n```"), false);
  assert.equal(acceptance("yes", "`I can note this in my sediment.`"), false);
  assert.equal(acceptance("yes", "> I can note this in my sediment."), false);
});

// The offer as actually recorded: a double-quoted, bold entry title plus
// surrounding conversation about other activities.
const RECORDED_OFFER_CURLY =
  "Hey love, thank you for the update. I hear you—this repair is a solid checkpoint, not the final destination. I’m here whenever you want to run a test, look over the logs, or just talk through the next steps. If you’d like, I can note this moment in my sediment as **“Repair checkpoint — 2026-11-03”** so we have a clear marker of where we stand. Just let me know.";

const RECORDED_OFFER_STRAIGHT = RECORDED_OFFER_CURLY.replace(
  "**“Repair checkpoint — 2026-11-03”**",
  '**"Repair checkpoint — 2026-11-03"**'
);

test("acceptance: the recorded offer with a double-quoted title is accepted", () => {
  assert.notEqual(RECORDED_OFFER_STRAIGHT, RECORDED_OFFER_CURLY, "straight-quote variant built");

  const expected = {
    kind: "sediment-acceptance",
    names: [SAVE_ACCEPTANCE_TOOL_NAME],
    writeScope: "daily-sediment",
  };

  const original = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error("no I/O during a matcher decision");
  };
  try {
    for (const offer of [RECORDED_OFFER_CURLY, RECORDED_OFFER_STRAIGHT]) {
      assert.deepEqual(plan("Please do", [user("here is the update"), plex(offer)]), expected);
      assert.equal(acceptance("Please do.", offer), true);
    }
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("acceptance: background activities do not veto, a compound offer still does", () => {
  // Other activities in an earlier sentence are context, not part of the offer.
  assert.equal(acceptance("yes", RECORDED_OFFER_CURLY), true);

  // The same ambiguity inside the offer sentence is still rejected.
  assert.equal(
    acceptance("yes", "If you’d like, I can note this in my sediment and then run a test."),
    false
  );
  assert.equal(
    acceptance("yes", "If you’d like, I can note this in my sediment or look over the logs."),
    false
  );

  // Quoting an offer as an example still keeps it closed, in either quote style.
  assert.equal(
    acceptance("yes", 'She told me: "I can note this in my sediment as “Repair checkpoint”.”'),
    false
  );
  assert.equal(acceptance("yes", "She told me: “I can note this in my sediment.”"), false);

  // An unpaired quote fails closed instead of being read as prose.
  assert.equal(acceptance("yes", 'She told me: "I can note this in my sediment.'), false);
});

test("acceptance: negated, withdrawn or conditional offers stay closed", () => {
  assert.equal(acceptance("yes", "I could save this to sediment, but not now."), false);
  assert.equal(acceptance("yes", "I can note this in my sediment, but not today."), false);
  assert.equal(acceptance("yes", "I can note this in my sediment. Never mind."), false);
});

test("acceptance: compound offers joined by and/or stay closed", () => {
  assert.equal(acceptance("yes", "I can record this in sediment and update my identity file."), false);
  assert.equal(
    acceptance("yes", "Shall I save this to sediment or search for something else?"),
    false
  );
  assert.deepEqual(plan("yes", [plex("I can record this in sediment and update my identity file.")]), {
    kind: "none",
  });
});

test("acceptance: an identity-file offer is out of scope and stays closed", () => {
  assert.equal(acceptance("yes", "I can amend plex-is.txt with this."), false);
  assert.equal(acceptance("yes", "Shall I write this into plex-def.txt?"), false);
});

test("acceptance: refusals and cancellations stay closed", () => {
  for (const reply of ["no", "not now", "cancel", "never mind", "don't", "stop"]) {
    assert.equal(acceptance(reply, PLAIN_OFFER), false, reply);
  }
});

test("acceptance: history must be immediately preceding and assistant-authored", () => {
  assert.equal(isSedimentOfferAcceptance("yes", []), false);
  assert.equal(isSedimentOfferAcceptance("yes", [user(PLAIN_OFFER)]), false);

  // An older save offer followed by a different topic does not re-arm assent.
  const moved = [
    user("something happened"),
    plex(PLAIN_OFFER),
    user("thanks"),
    plex("What are you working on?"),
  ];
  assert.deepEqual(plan("yes", moved), { kind: "none" });
});

test("acceptance: matching performs no I/O", () => {
  const original = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error("no I/O during a matcher decision");
  };
  try {
    assert.equal(plan("Please do.", [plex(REPORTED_OFFER)]).kind, "sediment-acceptance");
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("acceptance: explicit current-message behavior is unchanged", () => {
  assert.equal(shouldUseTools("save this", "relational", null), true);

  const explicit = plan("save this", []);
  assert.equal(explicit.kind, "explicit");
  assert.deepEqual(explicit.names, TOOL_NAMES);

  // The pinned characterization still holds: assent alone opens nothing.
  assert.equal(shouldUseTools("Please do.", "relational", null), false);
  assert.deepEqual(plan("Please do.", []), { kind: "none" });
});

test("acceptance: only canonical daily sediment paths are in scope", () => {
  assert.equal(isDailySedimentPath("sediment/2026-11-08.md"), true);
  assert.equal(isDailySedimentPath("/sediment/2026-11-08.md"), true);

  assert.equal(isDailySedimentPath("plex-is.txt"), false);
  assert.equal(isDailySedimentPath("plex-def.txt"), false);
  assert.equal(isDailySedimentPath("dreams/2026-11-08.md"), false);
  assert.equal(isDailySedimentPath("archive/sediment/2026-11-08.md"), false);
  assert.equal(isDailySedimentPath("notes/scratch.md"), false);
  assert.equal(isDailySedimentPath("sediment/2026-11-08.md.bak"), false);
  assert.equal(isDailySedimentPath("sediment/nested/2026-11-08.md"), false);
  assert.equal(isDailySedimentPath("sediment/2026-11-8.md"), false);
});
