# Silicon Index — Contributors Hub (stub)

- **Target repo:** `https://github.com/silicon-index/silicon-index-contributors.github.io`
- **Branch:** `dev`
- **Nav id:** `contributors` (see `src/config/navigation.ts`)

Guidelines, submission templates, and verification tiers

This directory is a documentation + contract stub inside the frontend repo. The
module itself lives in its own repository; nothing here is a copy of it.

## Contents

- `contracts.ts` — `ContributorTier` (`anonymous` | `trusted`), `ContributorProfile`,
  `PriceSubmission` + `NewSubmissionInput`, the verification schema
  (`VerificationCheck`, `REQUIRED_VERIFICATION_CHECKS`, `VerificationResult`),
  `TRUST_TIER_SPEC`, the outbound `ContributorSchemaPayload`, and the upstream
  `ContributorSubmission` wire shape with adapters both ways.
- `registry.ts` — `buildContributorRegistry()` (trust-score derivation) and `toContributorSchema()`.
- `identity.ts` — pseudonymous per-browser id for signed-out contributors.
