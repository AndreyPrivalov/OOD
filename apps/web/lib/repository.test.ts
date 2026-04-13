import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { MockPostgresRepository, MockInMemoryRepository } = vi.hoisted(() => ({
  MockPostgresRepository: class MockPostgresRepository {},
  MockInMemoryRepository: class MockInMemoryRepository {}
}));

vi.mock("@ood/db", () => ({
  PostgresWorkItemRepository: MockPostgresRepository,
  InMemoryWorkItemRepository: MockInMemoryRepository
}));

import { getRepository } from "./repository";

function resetRepositorySingleton() {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (globalThis as { __oodRepository?: unknown }).__oodRepository;
}

describe("getRepository", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    resetRepositorySingleton();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetRepositorySingleton();
  });

  it("selects Postgres repository when DATABASE_URL is present", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    process.env.DATABASE_URL = "postgres://db";
    process.env = { ...process.env, NODE_ENV: "development" };

    const repository = getRepository();

    expect(repository).toBeInstanceOf(MockPostgresRepository);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("PostgresWorkItemRepository selected")
    );
  });

  it("throws clear startup error when DATABASE_URL is missing in production", () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    delete process.env.DATABASE_URL;
    delete process.env.ALLOW_INMEMORY_DEV;

    expect(() => getRepository()).toThrow(
      "DATABASE_URL is required. InMemory repository is disabled unless NODE_ENV=test or ALLOW_INMEMORY_DEV=true in local development."
    );
  });

  it("allows InMemory repository in tests", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env = { ...process.env, NODE_ENV: "test" };
    delete process.env.DATABASE_URL;

    const repository = getRepository();

    expect(repository).toBeInstanceOf(MockInMemoryRepository);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("InMemoryWorkItemRepository selected")
    );
  });

  it("allows InMemory repository in local development only with explicit flag", () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    process.env.ALLOW_INMEMORY_DEV = "true";
    delete process.env.DATABASE_URL;

    const repository = getRepository();

    expect(repository).toBeInstanceOf(MockInMemoryRepository);
  });
});
