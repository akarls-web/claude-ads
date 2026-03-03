import { z } from "zod";
import { eq, and, desc, ne } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { googleAccounts } from "../db/schema";

export const accountRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(googleAccounts)
      .where(
        and(
          eq(googleAccounts.userId, ctx.userId),
          eq(googleAccounts.isActive, true),
          ne(googleAccounts.customerId, "oauth-connected")
        )
      )
      .orderBy(desc(googleAccounts.connectedAt));
  }),

  /** Add a customer ID manually — copies tokens from the "oauth-connected" placeholder row */
  addManual: protectedProcedure
    .input(z.object({ customerId: z.string().min(5).max(15) }))
    .mutation(async ({ ctx, input }) => {
      // Normalise: strip dashes
      const cid = input.customerId.replace(/-/g, "");

      // Find the oauth-connected placeholder to copy tokens from
      const [placeholder] = await db
        .select()
        .from(googleAccounts)
        .where(
          and(
            eq(googleAccounts.userId, ctx.userId),
            eq(googleAccounts.customerId, "oauth-connected")
          )
        );

      if (!placeholder) {
        throw new Error("No OAuth connection found. Connect Google Ads first.");
      }

      // Try to fetch account name
      let customerName = `Account ${cid}`;
      try {
        const { GoogleAdsService } = await import("../services/google-ads");
        const svc = new GoogleAdsService(placeholder.accessToken);
        customerName = await svc.getCustomerName(cid);
      } catch {
        // keep default name
      }

      const [created] = await db
        .insert(googleAccounts)
        .values({
          userId: ctx.userId,
          customerId: cid,
          customerName,
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
      // Find any stored account row for this user to get a refresh token
      const [tokenRow] = await db
        .select()
        .from(googleAccounts)
        .where(eq(googleAccounts.userId, ctx.userId))
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [tokenRow] = await db
        .select()
        .from(googleAccounts)
        .where(eq(googleAccounts.userId, ctx.userId))
        .limit(1);

      if (!tokenRow) {
        throw new Error("No OAuth connection found. Connect Google Ads first.");
      }

      // Get existing CIDs for this user to avoid duplicates
      const existing = await db
        .select({ customerId: googleAccounts.customerId })
        .from(googleAccounts)
        .where(
          and(
            eq(googleAccounts.userId, ctx.userId),
            eq(googleAccounts.isActive, true)
          )
        );
      const existingCids = new Set(existing.map((r) => r.customerId));

      const added: string[] = [];
      for (const acct of input.accounts) {
        const cid = acct.customerId.replace(/-/g, "");
        if (existingCids.has(cid)) continue;
        await db.insert(googleAccounts).values({
          userId: ctx.userId,
          customerId: cid,
          customerName: acct.customerName,
          accessToken: tokenRow.accessToken,
          refreshToken: tokenRow.refreshToken,
          tokenExpiresAt: tokenRow.tokenExpiresAt,
        });
        added.push(cid);
      }
      return { added };
    }),

  disconnect: protectedProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(googleAccounts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(googleAccounts.id, input.accountId),
            eq(googleAccounts.userId, ctx.userId)
          )
        )
        .returning();
      return updated;
    }),
});
