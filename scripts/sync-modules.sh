#!/usr/bin/env bash
#
# sync-modules.sh — publish the portal's data contracts to the sibling repos.
#
# WHY THIS EXISTS
#   The Codespaces GITHUB_TOKEN available to the in-editor assistant is a
#   user-to-server token scoped to THIS repository only. Reading other repos in
#   the org works; writing to them returns:
#       403 Resource not accessible by integration
#   Note that `gh api repos/<org>/<repo>` reports `permissions.push: true` —
#   that describes the *account's* rights, not the *token's*. So this sync runs
#   either from a local terminal with your own credentials, or from CI with a
#   PAT supplied as SYNC_TOKEN (see AUTHENTICATION below and
#   .github/workflows/sync.yml).
#
# WHAT IT DOES
#   For each target module repo, on branch `dev`:
#     - writes data/<payload>.json that the portal fetches at runtime
#     - writes data/README.md documenting the shape and its caveats
#     - commits and pushes
#
# USAGE
#   ./scripts/sync-modules.sh              # dry run — prints planned changes
#   ./scripts/sync-modules.sh --push       # actually commit and push
#
# AUTHENTICATION
#   Locally: nothing to do. Your ambient Git credentials (SSH agent, GitHub
#   Credential Manager, or `gh auth login`) are used as-is.
#
#   In CI: set SYNC_TOKEN (or GH_TOKEN) to a PAT with write access to the
#   target repos. NOTE: exporting GH_TOKEN alone is not enough for a plain
#   `git push` — that variable is read by the `gh` CLI, not by git. This script
#   therefore wires the token into git through a temporary credential helper,
#   so the token never appears in a remote URL, in argv, or in the logs.
#
set -euo pipefail

ORG="silicon-index"
BRANCH="dev"
PUSH=false
[[ "${1:-}" == "--push" ]] && PUSH=true

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log()  { printf '\033[36m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }

# Prefer an explicit sync token; fall back to GH_TOKEN; otherwise use ambient
# credentials. The token is passed to git via a helper that reads it from the
# environment, so it is never written into a URL or echoed.
export SYNC_AUTH_TOKEN="${SYNC_TOKEN:-${GH_TOKEN:-}}"
GIT_AUTH=()
if [[ -n "$SYNC_AUTH_TOKEN" ]]; then
  HELPER="$WORK/credential-helper.sh"
  cat > "$HELPER" <<'HELPER_EOF'
#!/usr/bin/env bash
[[ "${1:-}" == "get" ]] || exit 0
printf 'username=x-access-token\npassword=%s\n' "$SYNC_AUTH_TOKEN"
HELPER_EOF
  chmod +x "$HELPER"
  GIT_AUTH=(-c "credential.helper=$HELPER")
  log "Using token authentication (SYNC_TOKEN/GH_TOKEN)."
fi
git_c() { git ${GIT_AUTH[@]+"${GIT_AUTH[@]}"} "$@"; }

if ! $PUSH; then
  warn "DRY RUN — nothing will be pushed. Re-run with --push to publish."
fi

# ---------------------------------------------------------------------------
# 1. Generate market-data.json from the portal's dataset, using the same
#    normalization the portal applies (see src/services/dataService.ts).
# ---------------------------------------------------------------------------
log "==> Generating market-data.json from public/mock-data.json"
node - "$REPO_ROOT" "$WORK" <<'NODE'
const fs = require("fs");
const path = require("path");
const [, , repoRoot, work] = process.argv;

const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, "public/mock-data.json"), "utf8"));

const monthToTimestamp = (month) => {
  const [y, m] = month.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, 1);
};

const market = raw.map((e) => ({
  sku: e.id,
  name: e.name,
  category: e.category,
  msrp: e.msrp,
  medianMarketPrice: e.marketPrice,
  currency: e.currency,
  historicalPrices: e.priceHistory.map((p) => [monthToTimestamp(p.month), p.price]),
  fairValueScore: e.fairValueScore,
  socket: e.socket,
  generation: e.generation,
  releaseYear: e.releaseYear,
  tdpWatts: e.tdpWatts
}));

fs.writeFileSync(path.join(work, "market-data.json"), JSON.stringify(market, null, 2) + "\n");
console.log(`    ${market.length} components normalized`);
NODE

# Contributor registry ships empty on purpose — see the README written below.
printf '[]\n' > "$WORK/contributors.json"

# ---------------------------------------------------------------------------
# 2. Documentation written alongside each payload.
# ---------------------------------------------------------------------------
cat > "$WORK/market-README.md" <<'EOF'
# data/

## `market-data.json`

Consumed by the Main Portal at runtime via:

```
https://raw.githubusercontent.com/silicon-index/silicon-index-market-database.github.io/dev/data/market-data.json
```

### ⚠️ This is SEED SAMPLE DATA

The prices here are **sample/mock values, not real market pricing**. They exist so
the portal's data pipeline can be exercised end to end before the scrapers and
valuation engine are live. Do not cite, redistribute, or treat any figure here as
an observed market price.

Replace this file with scraper output once `silicon-index-market-scrapers` is
publishing; the portal needs no code change when that happens.

### Shape

Array of records:

| Field | Type | Notes |
| :--- | :--- | :--- |
| `sku` | string | Normalized `component_id` (DEV-GUIDE.md §2) |
| `name` | string | Display name |
| `category` | string | CPU / GPU / Motherboard / … |
| `msrp` | number | Launch MSRP |
| `medianMarketPrice` | number | Current median observed price |
| `currency` | string | ISO code |
| `historicalPrices` | `[number, number][]` | `[unix-ms timestamp, price]`, oldest first |
| `fairValueScore` | number | Deterministic fair-value index |
| `socket`, `generation` | string | Spec fields |
| `releaseYear`, `tdpWatts` | number | Spec fields |

The portal also accepts the raw `mock-data.json` shape and normalizes it — see
`src/services/dataService.ts` in `silicon-index.github.io`.
EOF

cat > "$WORK/contributors-README.md" <<'EOF'
# data/

## `contributors.json`

Consumed by the Main Portal at runtime via:

```
https://raw.githubusercontent.com/silicon-index/silicon-index-contributors.github.io/dev/data/contributors.json
```

### Intentionally empty

This ships as `[]` by design. Contributor profiles are **earned** through
admin-approved price submissions — seeding fake contributors would put invented
trust scores in front of users. Until the backend publishes a real registry, the
portal derives profiles locally from its own approved submissions.

### Shape

Array of records:

| Field | Type | Notes |
| :--- | :--- | :--- |
| `contributorId` | string | Username, or a pseudonymous `anon-xxxxxxxx` id |
| `tier` | `"anonymous" \| "trusted"` | `trusted` = submitted while signed in |
| `trustScore` | number | 0–100: approved / (approved + denied + flagged) |
| `verifiedSubmissions` | number | Count of admin-approved submissions |
| `lastApprovedAt` | string \| null | ISO 8601 timestamp |

**No PII.** Only a pseudonymous id and tier — never names, emails, IPs, or
locations, per DEV-GUIDE.md §2.
EOF

# ---------------------------------------------------------------------------
# 3. Sync each target repo.
#    args: <repo> <payload-file> <payload-name> <readme-file> <commit-message>
# ---------------------------------------------------------------------------
sync_repo() {
  local repo="$1" payload="$2" payload_name="$3" readme="$4" message="$5"
  local dir="$WORK/$repo"

  log "==> $repo (branch: $BRANCH)"

  if ! git_c clone --quiet --branch "$BRANCH" --depth 1 \
      "https://github.com/$ORG/$repo.git" "$dir" 2>/dev/null; then
    warn "    clone failed — check the repo exists, has a '$BRANCH' branch, and that you have access."
    return 1
  fi

  mkdir -p "$dir/data"
  cp "$payload" "$dir/data/$payload_name"
  cp "$readme" "$dir/data/README.md"

  if git -C "$dir" diff --quiet && [ -z "$(git -C "$dir" status --porcelain)" ]; then
    log "    already up to date — nothing to do"
    return 0
  fi

  log "    changes:"
  git -C "$dir" add -A
  git -C "$dir" --no-pager diff --cached --stat | sed 's/^/      /'

  if ! $PUSH; then
    log "    (dry run — not committing)"
    return 0
  fi

  # CI runners have no global git identity; set one per-clone if absent.
  if ! git -C "$dir" config user.email >/dev/null 2>&1; then
    git -C "$dir" config user.email "${SYNC_GIT_EMAIL:-actions@github.com}"
    git -C "$dir" config user.name  "${SYNC_GIT_NAME:-silicon-index sync}"
  fi

  git -C "$dir" commit --quiet -m "$message"
  if ! git_c -C "$dir" push --quiet origin "$BRANCH"; then
    warn "    push failed — the credentials in use lack write access to $repo."
    warn "    A Codespaces GITHUB_TOKEN cannot write to sibling repos (403); use a PAT via SYNC_TOKEN."
    return 1
  fi
  log "    pushed $(git -C "$dir" rev-parse --short HEAD)"
}

sync_repo "silicon-index-market-database.github.io" \
  "$WORK/market-data.json" "market-data.json" "$WORK/market-README.md" \
  "feat(data): publish market-data.json for portal raw-URL consumption

Seed sample data so silicon-index.github.io can resolve live instead of
falling back locally. Prices are mock values, documented as such in
data/README.md."

sync_repo "silicon-index-contributors.github.io" \
  "$WORK/contributors.json" "contributors.json" "$WORK/contributors-README.md" \
  "feat(data): add contributors registry endpoint

Ships empty by design; trust scores are earned through admin approval."

log ""
if $PUSH; then
  log "Done. Verify the portal now resolves remotely:"
else
  log "Dry run complete. Re-run with --push to publish, then verify:"
fi
cat <<'EOF'
  curl -sI https://raw.githubusercontent.com/silicon-index/silicon-index-market-database.github.io/dev/data/market-data.json | head -1
  curl -sI https://raw.githubusercontent.com/silicon-index/silicon-index-contributors.github.io/dev/data/contributors.json | head -1

The screener's source badge should then read "market-database (dev)"
instead of "local sample data".
EOF
