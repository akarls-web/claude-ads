import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { clients, audits, connections } from "../db/schema";

export const clientRouter = router({
  /** List all active clients for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.userId, ctx.userId),
          eq(clients.isActive, true)
        )
      )
      .orderBy(desc(clients.createdAt));
  }),

  /** Get a single client by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(eq(clients.id, input.id), eq(clients.userId, ctx.userId))
        );

      if (!client) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Client not found",
        });
      }

      return client;
    }),

  /** Create a new client */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        industry: z.string().max(100).optional(),
        website: z.string().url().optional().or(z.literal("")),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await db
        .insert(clients)
        .values({
          userId: ctx.userId,
          name: input.name,
          industry: input.industry || null,
          website: input.website || null,
          notes: input.notes || null,
        })
        .returning();
      return created;
    }),

  /** Update an existing client */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        industry: z.string().max(100).optional(),
        website: z.string().url().optional().or(z.literal("")),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      // Only include non-undefined fields
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.name !== undefined) updates.name = fields.name;
      if (fields.industry !== undefined)
        updates.industry = fields.industry || null;
      if (fields.website !== undefined)
        updates.website = fields.website || null;
      if (fields.notes !== undefined) updates.notes = fields.notes || null;

      const [updated] = await db
        .update(clients)
        .set(updates)
        .where(and(eq(clients.id, id), eq(clients.userId, ctx.userId)))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Client not found",
        });
      }

      return updated;
    }),

  /** Soft-delete a client */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(clients)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(eq(clients.id, input.id), eq(clients.userId, ctx.userId))
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Client not found",
        });
      }

      return updated;
    }),

  /** Get aggregated stats for a client — latest audit per type + counts */
  stats: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify client belongs to user
      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(eq(clients.id, input.id), eq(clients.userId, ctx.userId))
        );

      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }

      // Get all completed audits for this client
      const clientAudits = await db
        .select({
          id: audits.id,
          auditType: audits.auditType,
          score: audits.score,
          grade: audits.grade,
          status: audits.status,
          createdAt: audits.createdAt,
        })
        .from(audits)
        .where(
          and(
            eq(audits.clientId, input.id),
            eq(audits.userId, ctx.userId)
          )
        )
        .orderBy(desc(audits.createdAt));

      // Get connection count
      const connRows = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(connections)
        .where(
          and(
            eq(connections.clientId, input.id),
            eq(connections.userId, ctx.userId),
            eq(connections.isActive, true)
          )
        );

      // Build per-type scorecard: latest completed audit per type
      const typeMap = new Map<
        string,
        { auditType: string; score: number | null; grade: string | null; auditId: string; date: Date; totalAudits: number }
      >();

      for (const a of clientAudits) {
        const t = a.auditType;
        const existing = typeMap.get(t);
        if (existing) {
          existing.totalAudits++;
        } else {
          typeMap.set(t, {
            auditType: t,
            score: a.status === "completed" ? a.score : null,
            grade: a.status === "completed" ? a.grade : null,
            auditId: a.id,
            date: a.createdAt,
            totalAudits: 1,
          });
        }
      }

      return {
        connectionCount: connRows[0]?.cnt ?? 0,
        totalAudits: clientAudits.length,
        completedAudits: clientAudits.filter((a) => a.status === "completed").length,
        scorecard: Array.from(typeMap.values()),
      };
    }),
});
