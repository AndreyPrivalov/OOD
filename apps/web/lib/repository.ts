import {
  InMemoryWorkItemRepository,
  PostgresWorkItemRepository,
  type WorkItemRepository
} from "@ood/db";

declare global {
  // eslint-disable-next-line no-var
  var __oodRepository: WorkItemRepository | undefined;
}

export function getRepository() {
  if (!globalThis.__oodRepository) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    const nodeEnv = process.env.NODE_ENV ?? "development";
    const allowInMemoryDev = process.env.ALLOW_INMEMORY_DEV === "true";
    const productionLike =
      nodeEnv === "production" || process.env.VERCEL_ENV === "production";

    if (databaseUrl) {
      globalThis.__oodRepository = new PostgresWorkItemRepository();
      console.info(
        `[repo] PostgresWorkItemRepository selected (DATABASE_URL present, NODE_ENV=${nodeEnv})`
      );
      return globalThis.__oodRepository;
    }

    const inMemoryAllowed = nodeEnv === "test" || (allowInMemoryDev && !productionLike);
    if (!inMemoryAllowed) {
      throw new Error(
        "DATABASE_URL is required. InMemory repository is disabled unless NODE_ENV=test or ALLOW_INMEMORY_DEV=true in local development."
      );
    }

    globalThis.__oodRepository = new InMemoryWorkItemRepository();
    const reason =
      nodeEnv === "test"
        ? "NODE_ENV=test"
        : "ALLOW_INMEMORY_DEV=true and non-production mode";
    console.warn(
      `[repo] InMemoryWorkItemRepository selected (${reason}); data is ephemeral and will be lost on restart.`
    );
  }
  return globalThis.__oodRepository;
}
