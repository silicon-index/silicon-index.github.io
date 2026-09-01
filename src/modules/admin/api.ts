// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Admin Dashboard — privileged moderation API.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE OTHER SIDE OF THE AIRGAP. This is the only handler permitted to span
 * both halves: it reads `schema/staging.ts` and writes `schema/core.ts`.
 * Promotion of a submission into the trusted index happens here and nowhere
 * else, behind tier-2 authentication.
 *
 * The public contribution handler cannot do this — `contributors/api.ts`
 * never imports the core schema, and the architecture check fails the build if
 * it ever reaches it.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Every route requires `ADMIN_API_TOKEN`. There is no unauthenticated route
 * here at all, not even `/health`: whether a moderation queue exists is itself
 * information a stranger has no business learning.
 *
 * WinterCG-portable: the database is injected, so this file imports no driver.
 */

import { and, eq } from "drizzle-orm";
import type { SQLiteInsertValue, SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import { fail, json, methodNotAllowed, notFound, readJson, withApiMiddleware, type ApiEnv } from "../../platform/http";
import { requireServiceToken } from "../security/serviceAuth";
import { components } from "../database/schema/core";
import { submissions } from "../database/schema/staging";
import { DENIAL_REASONS, type ModerationAction } from "./contracts";

export interface AdminApiEnv extends ApiEnv {
  /** Tier-2 credential for every route in this module. */
  ADMIN_API_TOKEN?: string;
}

/** The slice of Drizzle this handler needs. Kept structural so no driver is imported. */
export interface ModerationDatabase {
  select(): {
    from(table: typeof submissions): {
      where(condition: unknown): Promise<Record<string, unknown>[]>;
    } & Promise<Record<string, unknown>[]>;
  };
  insert(table: typeof components): {
    values(row: SQLiteInsertValue<typeof components>): {
      onConflictDoUpdate(config: { target: unknown; set: SQLiteUpdateSetSource<typeof components> }): {
        run(): Promise<unknown>;
      };
    };
  };
  update(table: typeof submissions): {
    set(values: SQLiteUpdateSetSource<typeof submissions>): {
      where(condition: unknown): { run(): Promise<unknown> };
    };
  };
}

export interface AdminApiDeps {
  db: ModerationDatabase;
}

interface DecisionBody {
  submissionId?: unknown;
  action?: unknown;
  reason?: unknown;
}

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function createAdminApi(deps: AdminApiDeps) {
  async function route(request: Request, env: AdminApiEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Authenticated before routing: no route here is public, and an
    // unauthenticated caller should not learn which paths exist.
    const denied = await requireServiceToken(request, env as Record<string, string | undefined>, "admin");
    if (denied) return denied;

    if (pathname === "/health") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json({ status: "ok", module: "admin", authenticated: true });
    }

    if (pathname === "/queue") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const pending = await deps.db.select().from(submissions).where(eq(submissions.status, "pending"));
      return json({ count: pending.length, submissions: pending });
    }

    if (pathname === "/decide") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);

      const body = await readJson<DecisionBody>(request);
      if (!body.ok) return body.response;

      const submissionId = asString(body.value?.submissionId);
      const action = asString(body.value?.action) as ModerationAction;
      if (!submissionId) return fail(422, "Invalid decision", "submissionId is required.");
      if (!["approve", "deny", "flag", "reopen"].includes(action)) {
        return fail(422, "Invalid decision", "action must be approve, deny, flag or reopen.");
      }

      const [staged] = await deps.db.select().from(submissions).where(eq(submissions.submissionId, submissionId));
      if (!staged) return fail(404, "Unknown submission", submissionId);
      if (staged.status !== "pending" && staged.status !== "flagged") {
        return fail(409, "Already reviewed", `Submission is ${String(staged.status)}.`);
      }

      if (action === "deny") {
        const reason = asString(body.value?.reason);
        // Canonical tags only — free text here would be the one unvalidated
        // string a moderator could inject into the audit trail.
        if (!DENIAL_REASONS.includes(reason as (typeof DENIAL_REASONS)[number])) {
          return fail(422, "Invalid denial reason", `Must be one of: ${DENIAL_REASONS.join(", ")}.`);
        }
        await deps.db
          .update(submissions)
          .set({ status: "denied", denialReason: reason, reviewedAt: new Date() })
          .where(eq(submissions.submissionId, submissionId))
          .run();
        return json({ submissionId, status: "denied", reason });
      }

      if (action === "flag" || action === "reopen") {
        const status = action === "flag" ? "flagged" : "pending";
        await deps.db
          .update(submissions)
          .set({ status, reviewedAt: new Date() })
          .where(eq(submissions.submissionId, submissionId))
          .run();
        return json({ submissionId, status });
      }

      // approve — the ONLY path from staging into the trusted index.
      await deps.db
        .insert(components)
        .values({
          sku: String(staged.sku),
          name: String(staged.componentName),
          category: staged.category as never,
          manufacturer: String(staged.manufacturer),
          releaseYear: Number(staged.releaseYear),
          // A submission reports an observed price, not a launch MSRP; leaving
          // this null is honest rather than inventing one.
          originalMSRP: null,
          currency: String(staged.currency ?? "USD"),
          specs: staged.specs as never,
          medianMarketPrice: Number(staged.reportedPrice),
          fairValueScore: Number(staged.reportedPrice)
        })
        .onConflictDoUpdate({
          target: components.sku,
          set: {
            medianMarketPrice: Number(staged.reportedPrice),
            specs: staged.specs as never,
            updatedAt: new Date()
          }
        })
        .run();

      await deps.db
        .update(submissions)
        .set({ status: "approved", reviewedAt: new Date(), decisionNote: "Approved by moderator." })
        .where(and(eq(submissions.submissionId, submissionId), eq(submissions.status, staged.status as never)))
        .run();

      return json({ submissionId, status: "approved", promotedSku: String(staged.sku) });
    }

    return notFound(pathname);
  }

  return withApiMiddleware(route as (request: Request, env: ApiEnv) => Promise<Response>);
}
