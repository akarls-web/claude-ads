import { router } from "../trpc";
import { accountRouter } from "./account";
import { auditRouter } from "./audit";

export const appRouter = router({
  account: accountRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
