import { router } from "../trpc";
import { accountRouter } from "./account";
import { auditRouter } from "./audit";
import { clientRouter } from "./client";

export const appRouter = router({
  account: accountRouter,
  audit: auditRouter,
  clients: clientRouter,
});

export type AppRouter = typeof appRouter;
