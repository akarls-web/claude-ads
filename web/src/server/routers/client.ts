import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { clients } from "../db/schema";

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
});
