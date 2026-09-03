// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Contributors — public submission API.
 *
 * ────────────────────────────────────────────────────────────────────────
 * AIRGAP. This handler imports `database/schema/staging.ts` and nothing else
 * from the database module's tables. It holds zero references to
 * `schema/core.ts`, so a core table is not merely forbidden here — it is not
 * *nameable*. A bug in this file cannot write to the trusted index because the
 * identifiers do not exist in its scope.
 *
 * The database arrives by injection rather than import, which is what keeps
 * this WinterCG-portable: the caller supplies a LibSQL-backed instance in a
 * container or a D1-backed one on Workers, and this file imports no driver.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Routes
 *   GET  /token       issue a short-lived submission token
 *   POST /contribute  verify the token, validate, stage as `pending`
 */

import type { SQLiteInsertValue } from "drizzle-orm/sqlite-core";

import { fail, json, methodNotAllowed, notFound, readJson, withApiMiddleware, type ApiEnv } from "../../platform/http";
import { COMPONENT_CATEGORIES, type ComponentCategory, type ComponentSpecs } from "../database/contracts";
import { validateSpecs } from "../database/ingest";
import { submissions } from "../database/schema/staging";
import { DEFAULT_TOKEN_TTL_SECONDS, issueToken, verifyToken } from "./auth";

/** Just enough of a Drizzle instance to insert one staged row. */
export interface StagingWriter {
  insert(table: typeof submissions): {
    values(row: SQLiteInsertValue<typeof submissions>): { run(): Promise<unknown> };
  };
}

export interface ContributeApiEnv extends ApiEnv {
  /** HMAC secret for submission tokens. Required; the API fails closed without it. */
  CONTRIBUTE_TOKEN_SECRET?: string;
  /** Override the token lifetime, in seconds. */
  CONTRIBUTE_TOKEN_TTL?: string;
}

export interface ContributeApiDeps {
  /** Staging-only database handle. */
  db: StagingWriter;
}

interface ContributePayload {
  contributorHash?: unknown;
  contributorId?: unknown;
  contributorTier?: unknown;
  sku?: unknown;
  componentName?: unknown;
  manufacturer?: unknown;
  releaseYear?: unknown;
  category?: unknown;
  specs?: unknown;
  reportedPrice?: unknown;
  currency?: unknown;
  proofUrl?: unknown;
}

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function newSubmissionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "sub_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates an untrusted payload into a row.
 *
 * Every field is rebuilt from scratch rather than spread from the request, so
 * an attacker cannot smuggle extra columns — `status`, `reviewedAt`,
 * `autoAccepted` and `decisionNote` are never taken from input. A public write
 * can only ever produce a `pending` row.
 */
function toStagedRow(
  payload: ContributePayload
): { ok: true; row: SQLiteInsertValue<typeof submissions> } | { ok: false; message: string } {
  const category = asString(payload.category) as ComponentCategory;
  if (!COMPONENT_CATEGORIES.includes(category)) {
    return { ok: false, message: `category must be one of: ${COMPONENT_CATEGORIES.join(", ")}.` };
  }

  const sku = asString(payload.sku);
  const componentName = asString(payload.componentName);
  const manufacturer = asString(payload.manufacturer);
  const contributorHash = asString(payload.contributorHash);
  const contributorId = asString(payload.contributorId);
  const proofUrl = asString(payload.proofUrl);
  const releaseYear = Number(payload.releaseYear);
  const reportedPrice = Number(payload.reportedPrice);

  if (!sku || !componentName || !manufacturer) {
    return { ok: false, message: "sku, componentName and manufacturer are required." };
  }
  if (!contributorHash) return { ok: false, message: "contributorHash is required." };
  if (!Number.isFinite(releaseYear)) return { ok: false, message: "releaseYear must be a number." };
  if (!Number.isFinite(reportedPrice) || reportedPrice < 0) {
    return { ok: false, message: "reportedPrice must be a non-negative number." };
  }
  try {
    // Scheme allowlist, not just "does this parse": `new URL()` happily
    // accepts `javascript:`/`data:`/etc, and this value is later rendered
    // into an <a href> on the admin moderation dashboard. A non-http(s)
    // scheme there is a stored-XSS vector against an authenticated admin.
    const proofScheme = new URL(proofUrl).protocol;
    if (proofScheme !== "http:" && proofScheme !== "https:") {
      return { ok: false, message: "proofUrl must be an http:// or https:// URL." };
    }
  } catch {
    return { ok: false, message: "proofUrl must be a valid URL." };
  }

  const specs = (payload.specs ?? {}) as Record<string, unknown>;
  if (typeof specs !== "object" || Array.isArray(specs)) {
    return { ok: false, message: "specs must be an object." };
  }
  // Judged by the catalogue's own contract, so a submission cannot carry a
  // field the catalogue would refuse — e.g. a socket on a GPU.
  const issues = validateSpecs(specs, category);
  if (issues.length > 0) {
    return { ok: false, message: issues.map((i) => `${i.field}: ${i.message}`).join(" ") };
  }

  const tier = asString(payload.contributorTier) === "trusted" ? "trusted" : "anonymous";

  return {
    ok: true,
    row: {
      submissionId: newSubmissionId(),
      contributorHash,
      contributorId: contributorId || "anon",
      contributorTier: tier,
      sku,
      componentName,
      manufacturer,
      releaseYear,
      category,
      // `validateSpecs` has just proved this bag matches the category's
      // contract; the double assertion is the narrowing that proof implies.
      specs: specs as unknown as ComponentSpecs,
      reportedPrice,
      currency: asString(payload.currency) || "USD",
      proofUrl,
      // Not accepted from input, ever.
      status: "pending",
      submittedAt: new Date(),
      autoAccepted: false
    }
  };
}

/** Builds the handler. `deps.db` must be a staging-only handle. */
export function createContributorsApi(deps: ContributeApiDeps) {
  async function route(request: Request, env: ContributeApiEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    const secret = env.CONTRIBUTE_TOKEN_SECRET ?? "";

    if (pathname === "/health") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json({ status: "ok", module: "contributors", tokenConfigured: secret.length > 0 });
    }

    if (pathname === "/token") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const ttl = Number(env.CONTRIBUTE_TOKEN_TTL) || DEFAULT_TOKEN_TTL_SECONDS;
      try {
        const token = await issueToken(secret, { ttlSeconds: ttl });
        return json(
          { token, expiresIn: ttl },
          // Never cached: a shared cache would hand the same token to everyone.
          { headers: { "cache-control": "no-store" } }
        );
      } catch (err) {
        return fail(503, "Token issuing unavailable", (err as Error).message);
      }
    }

    if (pathname === "/contribute") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);

      // Verified BEFORE the body is parsed, so an unauthenticated caller
      // cannot make the server do work on an arbitrary payload.
      const supplied = request.headers.get("x-submission-token");
      let verification;
      try {
        verification = await verifyToken(secret, supplied);
      } catch (err) {
        return fail(503, "Token verification unavailable", (err as Error).message);
      }
      if (!verification.valid) {
        return fail(401, "Invalid submission token", `${verification.reason}: ${verification.detail}`);
      }

      const body = await readJson<ContributePayload>(request);
      if (!body.ok) return body.response;

      const staged = toStagedRow(body.value ?? {});
      if (!staged.ok) return fail(422, "Invalid submission", staged.message);

      await deps.db.insert(submissions).values(staged.row).run();

      // Deliberately thin: the response confirms staging and nothing more. It
      // does not echo the row back or reveal whether the SKU exists in the
      // catalogue, which would turn this endpoint into a probe.
      return json(
        { staged: true, submissionId: staged.row.submissionId, status: "pending" },
        { status: 202 }
      );
    }

    return notFound(pathname);
  }

  return withApiMiddleware(route as (request: Request, env: ApiEnv) => Promise<Response>);
}
