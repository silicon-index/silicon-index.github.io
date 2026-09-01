# Silicon Index — Security Portal (stub)

- **Target repo:** `https://github.com/silicon-index/silicon-index-security.github.io`
- **Branch:** `dev`
- **Nav id:** `security` (see `src/config/navigation.ts`)

Governance, incident advisories, and disclosure policies

This directory is a documentation + contract stub inside the frontend repo. The
module itself lives in its own repository; nothing here is a copy of it.

## Contents

- `contracts.ts` — `AdvisoryPayload` (`SI-YYYY-NNN`, severity, CVSS, `AffectedModule[]`),
  `AdvisorySeverity`/`AdvisoryStatus`, `IncidentReport` (`IncidentCategory`, `IncidentStatus`),
  and `DisclosurePolicy`. A reporter is a pseudonymous handle or null — there is deliberately
  no email, IP, or location field.

No runtime implementation yet — this module publishes nothing the portal consumes so far.
