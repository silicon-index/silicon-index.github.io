#!/usr/bin/env node
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
 *   3. Every `api.ts` is WinterCG-portable — no `node:*` builtin and no npm
 *      dependency. A Node import type-checks fine and then fails only once
 *      deployed to Cloudflare Workers, which is far too late to find out.
 *   4. No block comment is terminated early. Writing a glob such as
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
    else if (entry.name.endsWith(".ts") && entry.name !== "env.d.ts") out.push(full);
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

  for (const m of source.matchAll(/^import\s+(type\s+)?([^\n]*?)from\s+"([^"]+)"/gm)) {
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
      } else if (!isRelative && !isTypeOnly) {
        violations.push(`${file}: runtime dependency on "${spec}" — API handlers must stay dependency-free`);
      } else if (spec.startsWith("@modules/") || spec.startsWith("@/")) {
        violations.push(`${file}: alias import "${spec}" — use a relative path so wrangler and Bun resolve it`);
      }
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

if (violations.length) {
  console.error("Architecture check FAILED:\n" + violations.map((v) => `  ✗ ${v}`).join("\n"));
  process.exit(1);
}

const contracts = files.filter((f) => f.endsWith("contracts.ts"));
const apis = files.filter((f) => f.endsWith("api.ts"));
console.log(`Architecture check passed — ${files.length} files scanned, ` +
            `${contracts.length} contracts pure, ${apis.length} API handlers portable, no import cycles.`);
