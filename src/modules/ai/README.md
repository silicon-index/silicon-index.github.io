# Silicon Index — AI Models (stub)

- **Target repo:** `https://github.com/silicon-index/silicon-index-ai.github.io`
- **Branch:** `dev`
- **Nav id:** `ai` (see `src/config/navigation.ts`)

Mathematical anomaly detection and fair-value scoring engine

This directory is a documentation + contract stub inside the frontend repo. The
module itself lives in its own repository; nothing here is a copy of it.

## Contents

- `contracts.ts` — `FairValueInput`/`FairValueOutput`, `AnomalyDetectionInput`/`Output`,
  `AnomalyKind`, `AutoAcceptDecision`, and the `FairValueScorer` / `AnomalyDetector` /
  `AutoAcceptEvaluator` interfaces.
- `engine.ts` — implements them: `median()`, `detectAnomaly()`, `evaluateAutoAccept()`.
  Tolerance is read from `AUTO_ACCEPT_RULES` in `admin/contracts.ts`, so the rule set has
  exactly one definition.

## Headless API

`api.ts` — WinterCG handler (`GET /health`, `POST /score`, `POST /detect-anomaly`,
`POST /auto-accept`), backed by `engine.ts`. Pure computation with no upstream fetch,
so this is the strongest edge candidate. Deploy via `deploy/ai/`.
