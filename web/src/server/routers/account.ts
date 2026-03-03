import { z } from "zod";
import { eq, and, desc, ne } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { connections } from "../db/schema";

export const accountRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.userId, ctx.userId),
          eq(connections.isActive, true),
          ne(connections.externalId, "oauth-connected")
        )
      )
      .orderBy(desc(connections.connectedAt));
  }),

  /** Add a customer ID manually — copies tokens from the "oauth-connected" placeholder row */
  addManual: protectedProcedure
    .input(z.object({ customerId: z.string().min(5).max(15), clientId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Normalise: strip dashes
      const cid = input.customerId.replace(/-/g, "");

      // Find the oauth-connected placeholder to copy tokens from
      const [placeholder] = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.userId, ctx.userId),
            eq(connections.externalId, "oauth-connected")
          )
        );

      if (!placeholder) {
        throw new Error("No OAuth connection found. Connect Google Ads first.");
      }

      // Try to fetch account name
      let accountName = `Account ${cid}`;
      try {
        const { GoogleAdsService } = await import("../services/google-ads");
        const svc = new GoogleAdsService(placeholder.accessToken);
        accountName = await svc.getCustomerName(cid);
      } catch {
        // keep default name
      }

      const [created] = await db
        .insert(connections)
        .values({
          userId: ctx.userId,
          clientId: input.clientId ?? null,
          platform: "google_ads",
          externalId: cid,
          accountName,
          accessToken: placeholder.accessToken,
          refreshToken: placeholder.refreshToken,
          tokenExpiresAt: placeholder.tokenExpiresAt,
        })
        .returning();
      return created;
    }),

  /** Browse child accounts under an MCC (supports drilling into sub-MCCs) */
  mccChildren: protectedProcedure
    .input(z.object({ mccId: z.string().min(5).max(15) }))
    .query(async ({ ctx, input }) => {
      // Find any stored connection row for this user to get a refresh token
      const [tokenRow] = await db
        .select()
        .from(connections)
        .where(eq(connections.userId, ctx.userId))
        .limit(1);

      if (!tokenRow) {
        throw new Error("No OAuth connection found. Connect Google Ads first.");
      }

      const { GoogleAdsService } = await import("../services/google-ads");
      const svc = await GoogleAdsService.fromRefreshToken(tokenRow.refreshToken);
      return svc.listMccChildren(input.mccId.replace(/-/g, ""));
    }),

  /** Add one or more accounts from MCC browse — copies tokens from any existing row */
  addFromMcc: protectedProcedure
    .input(
      z.object({
        accounts: z.array(
          z.object({
            customerId: z.string(),
            customerName: z.string(),
          })
        ),
        clientId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [tokenRow] = await db
        .select()
        .from(connections)
        .where(eq(connections.userId, ctx.userId))
        .limit(1);

      if (!tokenRow) {
        throw new Error("No OAuth connection found. Connect Google Ads first.");
      }

      // Get existing CIDs for this user to avoid duplicates
      const existing = await db
        .select({ externalId: connections.externalId })
        .from(connections)
        .where(
          and(
            eq(connections.userId, ctx.userId),
            eq(connections.isActive, true)
          )
        );
      const existingCids = new Set(existing.map((r) => r.externalId));

      const added: string[] = [];
      for (const acct of input.accounts) {
        const cid = acct.customerId.replace(/-/g, "");
        if (existingCids.has(cid)) continue;
        await db.insert(connections).values({
          userId: ctx.userId,
          clientId: input.clientId ?? null,
          platform: "google_ads",
          externalId: cid,
          accountName: acct.customerName,
          accessToken: tokenRow.accessToken,
          refreshToken: tokenRow.refreshToken,
          tokenExpiresAt: tokenRow.tokenExpiresAt,
        });
        added.push(cid);
      }
      return { added };
    }),

  /** Assign or reassign a connection to a client */
  assignClient: protectedProcedure
    .input(
      z.object({
        connectionId: z.string().uuid(),
        clientId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(connections)
        .set({ clientId: input.clientId, updatedAt: new Date() })
        .where(
          and(
            eq(connections.id, input.connectionId),
            eq(connections.userId, ctx.userId)
          )
        )
        .returning();
      return updated;
    }),

  disconnect: protectedProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(connections)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(connections.id, input.accountId),
            eq(connections.userId, ctx.userId)
          )
        )
        .returning();
      return updated;
    }),
});
