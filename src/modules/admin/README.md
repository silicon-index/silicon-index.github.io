# Silicon Index — Admin Dashboard (stub)

- **Target repo:** `https://github.com/silicon-index/silicon-index-admin-dashboard.github.io`
- **Branch:** `dev`
- **Nav id:** `admin` (see `src/config/navigation.ts`)

Moderation console for hardware submission approval and review

This directory is a documentation + contract stub inside the frontend repo. The
module itself lives in its own repository; nothing here is a copy of it.

## Contents

- `contracts.ts` — `SubmissionStatus` (the submission lifecycle is owned here because its
  states are moderation outcomes), `ModerationAction`, `DENIAL_REASONS` / `DenialReason`,
  `ModerationDecision`, and `AutoAcceptRuleSpec` + `AUTO_ACCEPT_RULES` — the rule set encoded
  as inspectable data rather than buried in a function body.
- `moderation.ts` — `approve()`, `deny(reason)`, `flag()`, `reopen()`, `getReviewQueue()`,
  `getReviewed()`, `runAutoAcceptEngine()`.
