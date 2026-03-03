import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-oauth";
import { db } from "@/server/db";
import { connections } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { GoogleAdsService } from "@/server/services/google-ads";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/connect?error=access_denied", process.env.NEXT_PUBLIC_APP_URL!)
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL("/connect?error=missing_params", process.env.NEXT_PUBLIC_APP_URL!)
    );
  }

  let userId: string;
  let clientId: string | undefined;
  try {
    const state = JSON.parse(
      Buffer.from(stateParam, "base64url").toString("utf-8")
    );
    userId = state.userId;
    clientId = state.clientId;
  } catch {
    return NextResponse.redirect(
      new URL("/connect?error=invalid_state", process.env.NEXT_PUBLIC_APP_URL!)
    );
  }

  try {
    const tokens = await exchangeCode(code);

    console.log("[OAuth callback] Token exchange result:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      tokenType: tokens.token_type,
      scope: tokens.scope,
    });

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/connect?error=no_tokens&detail=Google+did+not+return+tokens.+Make+sure+you+granted+access.", process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    const adsService = new GoogleAdsService(tokens.access_token);
    let customers: string[] = [];

    // Strategy 1: Try listAccessibleCustomers
    try {
      customers = await adsService.listAccessibleCustomers();
      console.log("[OAuth callback] listAccessibleCustomers returned:", customers);
    } catch (e) {
      console.warn("[OAuth callback] listAccessibleCustomers failed, trying MCC query:", e);
    }

    // Strategy 2: If that fails and we have an MCC, query child accounts via GAQL
    if (customers.length === 0 && process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
      try {
        const mccId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
        const rows = await adsService.query(mccId, `
          SELECT
            customer_client.id,
            customer_client.descriptive_name,
            customer_client.manager
          FROM customer_client
          WHERE customer_client.status = 'ENABLED'
        `);
        console.log("[OAuth callback] MCC child query returned:", rows.length, "rows");
        for (const row of rows) {
          const cc = row.customerClient;
          if (cc && !cc.manager) {
            const cid = String(cc.id);
            await db.insert(connections).values({
              userId,
              clientId: clientId ?? null,
              platform: "google_ads",
              externalId: cid,
              accountName: cc.descriptiveName ?? `Account ${cid}`,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token!,
              tokenExpiresAt: tokens.expiry_date
                ? new Date(tokens.expiry_date)
                : null,
            });
            customers.push(cid);
          }
        }
      } catch (e2) {
        console.warn("[OAuth callback] MCC child query also failed:", e2);
      }
    }

    // Strategy 3: If we still have nothing, save tokens so user can manually add CIDs
    if (customers.length === 0) {
      await db.insert(connections).values({
        userId,
        clientId: clientId ?? null,
        platform: "google_ads",
        externalId: "oauth-connected",
        accountName: "OAuth connected — add account IDs manually",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        tokenExpiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      });

      return NextResponse.redirect(
        new URL(
          `/connect?success=true&manual=true`,
          process.env.NEXT_PUBLIC_APP_URL!
        )
      );
    }

    // Store accounts from Strategy 1 (Strategy 2 already stored them inline)
    if (customers.length > 0) {
      // Check if we already stored them (Strategy 2)
      const existing = await db.select().from(connections).where(eq(connections.userId, userId));
      const existingCids = new Set(existing.map((a) => a.externalId));

      for (const customerId of customers) {
        if (existingCids.has(customerId)) continue;
        const accountName = await adsService.getCustomerName(customerId);
        await db.insert(connections).values({
          userId,
          clientId: clientId ?? null,
          platform: "google_ads",
          externalId: customerId,
          accountName,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token!,
          tokenExpiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null,
        });
      }
    }

    return NextResponse.redirect(
      new URL(
        `/connect?success=true&count=${customers.length}`,
        process.env.NEXT_PUBLIC_APP_URL!
      )
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Google OAuth callback error:", msg, err);
    return NextResponse.redirect(
      new URL(
        `/connect?error=oauth_failed&detail=${encodeURIComponent(msg)}`,
        process.env.NEXT_PUBLIC_APP_URL!
      )
    );
  }
}
