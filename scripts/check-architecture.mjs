#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Architecture guard for the modular split.
 *
 * Enforces the two invariants that make `src/modules/` safe to split into
 * separate repos later, and that TypeScript will NOT catch on its own:
 *
 *   1. Every `contracts.ts` is pure — type-only imports, no runtime import.
 *      A runtime import in a contract means importing a type drags behaviour
 *      along, which defeats the decoupling.
 *   2. The import graph is acyclic. TypeScript compiles cyclic imports
 *      happily; they fail at runtime as undefined bindings.
 *   3. Every `api.ts` is WinterCG-portable — no `node:*` builtin, and no npm
 *      dependency outside an explicit allowlist of packages verified to run on
 *      Workers. A Node import type-checks fine and then fails only once
 *      deployed, which is far too late to find out.
 *   4. Server-only modules (the Node-targeted database drivers) are never
 *      reachable from a page, component, layout, or a WinterCG `api.ts`.
 *      `@libsql/client` pulls in `node:*`; bundling it into a browser or a
 *      Worker breaks at runtime, not at compile time.
 *   5. The database AIRGAP: the public contribution path must not reach the
 *      core (trusted index) tables, directly or transitively. Staging is a
 *      write-only quarantine; promotion happens in a separate, moderated path.
 *   6. No client-reachable file names a server-side secret. A static build has
 *      no request-time server, so anything a page can read is public: a token
 *      referenced there is a published credential, not a protected one.
 *   7. No client-reachable file presents a tier-2 service credential. Rule 6
 *      stops a page reading one from the environment; this stops the other
 *      route in — an operator pasting one into a field, which put a live
 *      secret inside a browser and only ever lived as long as the tab. The
 *      admin panel is server-rendered on a private host instead, so the
 *      browser carries no credential at all.
 *   8. No block comment is terminated early. Writing a glob such as
 *      `modules/<star>/api.ts` inside a JSDoc block closes it at the `*` + `/`,
 *      and everything after is parsed as code. tsc catches this only for files
 *      it type-checks, so a script outside tsconfig fails at runtime instead.
 *
 * Usage: node scripts/check-architecture.mjs   (exit 1 on violation)
 */
import { readFileSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SRC = "src";

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    // `.astro` too: pages and components are where client-reachable code
    // actually lives, and scanning only `.ts` meant rules 4-6 never saw them.
    else if ((entry.name.endsWith(".ts") || entry.name.endsWith(".astro")) && entry.name !== "env.d.ts") {
      out.push(full);
    }
  }
  return out;
}

function resolveSpec(spec, fromFile) {
  let target;
  if (spec.startsWith("@modules/")) target = path.join(SRC, "modules", spec.slice("@modules/".length));
  else if (spec.startsWith("@/")) target = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) target = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const rel = path.relative(process.cwd(), target);
  for (const cand of [`${rel}.ts`, path.join(rel, "index.ts")]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

// Scripts are scanned too: they are outside tsconfig, so nothing else checks them.
const files = [...(await walk(SRC)), ...(await walk("scripts")).filter((f) => f.endsWith(".ts"))];

/**
 * Modules that may only run in a serverful/container context. Anything that
 * ships to a browser or a Worker must not reach them, directly or through the
 * import graph.
 */
const SERVER_ONLY = new Set(["src/modules/database/db.ts"]);

/**
 * npm packages an `api.ts` may import at runtime.
 *
 * Allowlist, not a blanket ban: `drizzle-orm` is pure JS and runs on Workers,
 * so query building belongs in a portable handler. `@libsql/client` does NOT
 * belong here — it is Node-targeted and is why `db.ts` is server-only. Adding
 * to this list means asserting the package runs on Cloudflare Workers; the
 * `esbuild --platform=neutral` check is what proves it.
 */
const API_RUNTIME_ALLOWLIST = [/^drizzle-orm(\/|$)/];

/**
 * Env vars that must never appear in code shipped to a browser.
 *
 * Astro inlines `PUBLIC_*` into the client bundle and refuses everything else,
 * so a secret referenced from a page is either inlined (published) or silently
 * undefined (broken). Both outcomes are worse than failing the build here.
 */
/**
 * The header a tier-2 service token travels in. Client-reachable code must
 * never send it: the portal is a static site with no credential to send.
 */
const SERVICE_TOKEN_HEADER = "x-service-token";

const SERVER_SECRETS = [
  "ADMIN_API_TOKEN",
  "DATABASE_API_TOKEN",
  "AI_API_TOKEN",
  "SCRAPERS_API_TOKEN",
  "CONTRIBUTORS_API_TOKEN",
  "CONTRIBUTE_TOKEN_SECRET",
  "DATABASE_AUTH_TOKEN",
  "DATABASE_URL"
];

/**
 * The airgap. Modules on the public contribution path may reach the staging
 * schema and nothing else in the database's table layer.
 */
const CORE_SCHEMA = "src/modules/database/schema/core.ts";
const AIRGAPPED_ENTRIES = new Set(["src/modules/contributors/api.ts"]);

/** Entry points whose code is shipped to a browser or a Worker. */
const isClientReachable = (f) =>
  f.startsWith("src/pages/") ||
  f.startsWith("src/components/") ||
  f.startsWith("src/layouts/") ||
  f.startsWith("src/ui/") ||
  f.endsWith("api.ts");
const graph = new Map();
const violations = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const deps = new Set();

  // A JSDoc continuation line (` * ...`) whose `*/` is not the end of the line
  // has closed the comment early — the rest of the prose becomes code.
  source.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("*") || trimmed.startsWith("*/")) return;
    const at = trimmed.indexOf("*/");
    if (at !== -1 && at !== trimmed.length - 2) {
      violations.push(
        `${file}:${index + 1}: block comment terminated early by "*/" — ` +
        `rewrite the glob (e.g. "modules/<id>/api.ts")`
      );
    }
  });

  // Both `import ... from` and `export ... from` create a real dependency
  // edge. Missing the re-export form made the graph incomplete and let an
  // indirect airgap breach through a barrel file pass unnoticed.
  for (const m of source.matchAll(/^(?:import|export)\s+(type\s+)?([^\n]*?)from\s+"([^"]+)"/gm)) {
    const isTypeOnly = Boolean(m[1]) || /^\s*\{\s*type\s/.test(m[2]);
    const resolved = resolveSpec(m[3], file);
    if (resolved) deps.add(resolved);

    if (file.endsWith("contracts.ts") && !isTypeOnly) {
      violations.push(`${file}: runtime import of "${m[3]}" — contracts must be type-only`);
    }

    if (file.endsWith("api.ts")) {
      const spec = m[3];
      const isRelative = spec.startsWith(".");
      if (spec.startsWith("node:")) {
        violations.push(`${file}: imports Node builtin "${spec}" — API handlers must run on Cloudflare Workers`);
      } else if (!isRelative && !isTypeOnly && !API_RUNTIME_ALLOWLIST.some((re) => re.test(spec))) {
        violations.push(
          `${file}: runtime dependency on "${spec}" — API handlers may only import ` +
          `packages proven to run on Cloudflare Workers (see API_RUNTIME_ALLOWLIST)`
        );
      } else if (spec.startsWith("@modules/") || spec.startsWith("@/")) {
        violations.push(`${file}: alias import "${spec}" — use a relative path so wrangler and Bun resolve it`);
      }
    }
  }
  // Rule 6: a page/component/ui file must not so much as name a server secret.
  // API handlers legitimately read them from their injected env.
  if (isClientReachable(file) && !file.endsWith("api.ts")) {
    for (const secret of SERVER_SECRETS) {
      // Match an env *read* (`import.meta.env.X`, `process.env.X`, `env.X`,
      // `env["X"]`), not a mention of the name. Documentation and UI copy must
      // be free to explain why the token is not held here — a checker with
      // false positives is one that gets switched off.
      const read = new RegExp(
        String.raw`(?:import\.meta\.env|process\.env|\benv)\s*(?:\.\s*${secret}\b|\[\s*["'\`]${secret}["'\`]\s*\])`
      );
      if (read.test(source)) {
        violations.push(
          `${file}: references server secret ${secret} — client-reachable code cannot hold one. ` +
          `Have the operator supply it at runtime instead.`
        );
      }
    }
  }

  // Rule 7: client-reachable code must not present a service credential.
  // Matched as a quoted header name — a real use — so a page is still free to
  // explain in prose why it holds no token.
  if (isClientReachable(file) && !file.endsWith("api.ts")) {
    if (new RegExp(String.raw`["'\`]${SERVICE_TOKEN_HEADER}["'\`]`, "i").test(source)) {
      violations.push(
        `${file}: sends the ${SERVICE_TOKEN_HEADER} header — client-reachable code has no tier-2 ` +
        `credential to send. Privileged calls belong on the private admin host (deploy/admin/server.ts).`
      );
    }
  }

  graph.set(file, deps);
}

// DFS cycle detection
const WHITE = 0, GREY = 1, BLACK = 2;
const color = new Map(files.map((f) => [f, WHITE]));
const cycles = [];
function dfs(node, stack) {
  color.set(node, GREY);
  stack.push(node);
  for (const dep of graph.get(node) ?? []) {
    if (color.get(dep) === GREY) cycles.push([...stack.slice(stack.indexOf(dep)), dep]);
    else if (color.get(dep) === WHITE) dfs(dep, stack);
  }
  stack.pop();
  color.set(node, BLACK);
}
for (const f of files) if (color.get(f) === WHITE) dfs(f, []);

for (const c of cycles) violations.push(`import cycle: ${c.join(" -> ")}`);

// The public contribution path must never reach the trusted core tables.
for (const entry of AIRGAPPED_ENTRIES) {
  if (!graph.has(entry)) {
    violations.push(`airgap entry ${entry} not found — update AIRGAPPED_ENTRIES`);
    continue;
  }
  const seen = new Set();
  const stack = [[entry, [entry]]];
  while (stack.length > 0) {
    const [node, path] = stack.pop();
    for (const dep of graph.get(node) ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (dep === CORE_SCHEMA) {
        violations.push(
          `AIRGAP BREACH — ${entry} reaches the trusted core schema via ` +
          `${[...path, dep].join(" -> ")}. The public contribution path may only write to staging.`
        );
        continue;
      }
      stack.push([dep, [...path, dep]]);
    }
  }
}

// Walk the graph from every client-reachable entry point and report any path
// that lands on a server-only module.
for (const entry of files.filter(isClientReachable)) {
  const seen = new Set();
  const stack = [[entry, [entry]]];
  while (stack.length > 0) {
    const [node, path] = stack.pop();
    for (const dep of graph.get(node) ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (SERVER_ONLY.has(dep)) {
        violations.push(
          `${entry}: reaches server-only module ${dep} via ${[...path, dep].join(" -> ")} — ` +
          `it pulls in node:* and cannot run in a browser or Worker`
        );
        continue;
      }
      stack.push([dep, [...path, dep]]);
    }
  }
}

if (violations.length) {
  console.error("Architecture check FAILED:\n" + violations.map((v) => `  ✗ ${v}`).join("\n"));
  process.exit(1);
}

const contracts = files.filter((f) => f.endsWith("contracts.ts"));
const apis = files.filter((f) => f.endsWith("api.ts"));
console.log(`Architecture check passed — ${files.length} files scanned, ` +
            `${contracts.length} contracts pure, ${apis.length} API handlers portable, ` +
            `${SERVER_ONLY.size} server-only module(s) unreachable from client code, ` +
            `airgap intact for ${AIRGAPPED_ENTRIES.size} public write path(s), ` +
            `no server secret and no service credential in client code, ` +
            `no import cycles.`);
