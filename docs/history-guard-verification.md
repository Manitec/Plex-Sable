# Session history guard verification

Date: 2026-10-14
PR: #7
Tested application commit: 5543951ffeda5fea6ca529dc947adbc24855e6ac

## Fresh sandbox verification

Runtime: Node 22.23.3, npm 10.9.9.

- Clean dependency installation passed with npm ci.
- scripts/test-session-history.mjs passed.
- scripts/test-speak-history.mjs passed using mocked model and Firestore clients.
- Project-wide TypeScript checking (tsc --noEmit) passed.
- package.json, package-lock.json, and src/app/api/speak/route.ts were unchanged by the checks.

The first test attempt stopped at an npm launcher usage error inside a nested npx call. Running the installed Node 22 executable directly resolved the launcher issue without source changes; both test scripts and TypeScript checking then exited successfully.

## Scope and limitations

These checks cover role normalization, supplied-history validation, stored/override persistence selection, primary and fallback model message roles, LM Studio message roles, direct sub-voice behavior, and a mocked persistence failure. They do not certify live model availability, production credentials, Firestore permissions, real tool execution, or existing production-history role values.

No production database writes or history migration were performed. The growing session-document issue and One endpoint history/persistence repairs remain separate work.

## GitHub CI

This documentation-only commit intentionally triggers the existing Session history contract workflow on the repair branch. The fresh GitHub check must be inspected on this new head commit; the sandbox result is not itself a GitHub check badge. No application source or CI permissions are changed by this documentation commit.
