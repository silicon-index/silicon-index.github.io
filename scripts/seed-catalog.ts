#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * seed-catalog — bulk historical catalogue ingestion.
 *
 * Populating the 1990–present catalogue is a BULK DATA problem, not a scraping
 * problem: launch specs and MSRPs for decades-old parts come from datasets and
 * archives, and no live store lists a 1994 CPU. Scraping is for live pricing
 * only, so this tool deliberately does not touch the `scrapers` module.
 *
 * This file is the I/O shell. All parsing, validation, and normalization live
 * in `src/modules/database/ingest.ts`, which is pure, type-checked, and unit
 * tested — the same split used for the module APIs and their bootstraps.
 *
 * Usage
 *   npm run seed:catalog -- <input...> [options]
 *   npx vite-node scripts/seed-catalog.ts -- <input...> [options]
 *
 * Run it through vite-node, not `node` directly: the repo uses extensionless
 * relative imports throughout, which Node's native type stripping rejects.
 *
 *   <input...>          One or more .csv or .json bulk files.
 *   --out <path>        Output payload (default: public/catalog.json).
 *   --report <path>     Write the full rejection report as JSON.
 *   --dry-run           Validate and summarize; write nothing.
 *   --strict            Exit non-zero if any row was rejected.
 *
 * Examples
 *   npm run seed:catalog -- data/cpus-1990-2010.csv --dry-run
 *   npm run seed:catalog -- data/cpus.csv data/gpus.json --out public/catalog.json --strict
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { ingestBulkPayload } from "../src/modules/database/ingest.ts";
import type { CatalogComponent, IngestionReport, RejectedRow } from "../src/modules/database/contracts.ts";

interface CliOptions {
  inputs: string[];
  out: string;
  report: string | null;
  dryRun: boolean;
  strict: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { inputs: [], out: "public/catalog.json", report: null, dryRun: false, strict: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") options.out = argv[++i] ?? options.out;
    else if (arg === "--report") options.report = argv[++i] ?? null;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(2);
    } else options.inputs.push(arg);
  }

  return options;
}

function printUsage(): void {
  console.log(`
seed-catalog — bulk historical catalogue ingestion

  seed-catalog <input...> [--out <path>] [--report <path>] [--dry-run] [--strict]

  <input...>       One or more .csv or .json bulk catalogue files
  --out <path>     Output payload            (default: public/catalog.json)
  --report <path>  Write the rejection report as JSON
  --dry-run        Validate and summarize; write nothing
  --strict         Exit non-zero if any row was rejected
`);
}

function summarize(report: IngestionReport): void {
  const { source, totalRows, accepted, rejected, duplicateSkus } = report;
  console.log(`\n${source}`);
  console.log(`  rows       ${totalRows}`);
  console.log(`  accepted   ${accepted.length}`);
  console.log(`  rejected   ${rejected.length}${duplicateSkus.length ? `  (${duplicateSkus.length} duplicate SKU)` : ""}`);

  // Show why rows failed — a silent drop is how bad source data goes unnoticed.
  const shown = rejected.slice(0, 10);
  for (const row of shown) {
    const reasons = row.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ");
    console.log(`    row ${row.row}${row.sku ? ` [${row.sku}]` : ""} — ${reasons}`);
  }
  if (rejected.length > shown.length) {
    console.log(`    … ${rejected.length - shown.length} more (use --report to write them all)`);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.inputs.length === 0) {
    console.error("No input files given.");
    printUsage();
    process.exit(2);
  }

  const catalog: CatalogComponent[] = [];
  const allRejected: (RejectedRow & { source: string })[] = [];
  const seen = new Set<string>();
  let totalRows = 0;

  for (const input of options.inputs) {
    const path = resolve(process.cwd(), input);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (err) {
      console.error(`Cannot read ${input}: ${(err as Error).message}`);
      process.exit(1);
    }

    let report: IngestionReport;
    try {
      report = ingestBulkPayload(text, input);
    } catch (err) {
      console.error(`Cannot parse ${input}: ${(err as Error).message}`);
      process.exit(1);
    }

    summarize(report);
    totalRows += report.totalRows;
    allRejected.push(...report.rejected.map((row) => ({ ...row, source: input })));

    // De-duplicate ACROSS files too, not only within one.
    for (const component of report.accepted) {
      if (seen.has(component.sku)) {
        allRejected.push({
          source: input,
          row: 0,
          sku: component.sku,
          issues: [{ field: "sku", message: "Duplicate SKU across input files; first occurrence kept." }]
        });
        continue;
      }
      seen.add(component.sku);
      catalog.push(component);
    }
  }

  catalog.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.releaseYear - b.releaseYear ||
      a.name.localeCompare(b.name)
  );

  const byCategory = catalog.reduce<Record<string, number>>((acc, component) => {
    acc[component.category] = (acc[component.category] ?? 0) + 1;
    return acc;
  }, {});
  const years = catalog.map((c) => c.releaseYear);

  console.log(`\n${"─".repeat(52)}`);
  console.log(`  total rows      ${totalRows}`);
  console.log(`  catalogued      ${catalog.length}`);
  console.log(`  rejected        ${allRejected.length}`);
  if (years.length > 0) console.log(`  year range      ${Math.min(...years)}–${Math.max(...years)}`);
  console.log(`  by category     ${Object.entries(byCategory).map(([k, v]) => `${k}:${v}`).join("  ") || "—"}`);

  if (options.report) {
    const reportPath = resolve(process.cwd(), options.report);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify({ totalRows, rejected: allRejected }, null, 2) + "\n");
    console.log(`  report          ${options.report}`);
  }

  if (options.dryRun) {
    console.log(`\n  dry run — nothing written. Re-run without --dry-run to write ${options.out}.`);
  } else {
    const outPath = resolve(process.cwd(), options.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n");
    console.log(`\n  wrote           ${options.out}  (${catalog.length} components)`);
  }

  if (options.strict && allRejected.length > 0) {
    console.error(`\nstrict: ${allRejected.length} row(s) rejected.`);
    process.exit(1);
  }
}

main();
