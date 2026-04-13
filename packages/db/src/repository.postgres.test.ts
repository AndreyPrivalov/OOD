import { describe, expect, it } from "vitest";
import { DomainErrorCode } from "@ood/domain";
import { PostgresWorkItemRepository } from "./repository";

type DbStubState = {
  selectQueue: unknown[][];
  updateCalls: number;
};

function createDbStub(state: DbStubState): any {
  function consumeSelectResult() {
    return Promise.resolve(state.selectQueue.shift() ?? []);
  }

  return {
    select() {
      return {
        from() {
          return this;
        },
        where() {
          return this;
        },
        limit() {
          return consumeSelectResult();
        },
        orderBy() {
          return consumeSelectResult();
        }
      };
    },
    insert() {
      return {
        values: async () => undefined
      };
    },
    update() {
      return {
        set: () => ({
          where: async () => {
            state.updateCalls += 1;
          }
        })
      };
    }
  };
}

function row(partial: Record<string, unknown>) {
  return {
    id: "id",
    workspaceId: "ws",
    title: "title",
    object: null,
    possiblyRemovable: false,
    parentId: null,
    siblingOrder: 0,
    overcomplication: null,
    importance: null,
    blocksMoney: null,
    currentProblems: [],
    solutionVariants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial
  };
}

describe("PostgresWorkItemRepository", () => {
  it("rejects rating update for parent node", async () => {
    const state: DbStubState = {
      selectQueue: [
        [row({ id: "parent", workspaceId: "ws" })],
        [{ id: "child" }]
      ],
      updateCalls: 0
    };
    const repo = new PostgresWorkItemRepository(createDbStub(state));

    await expect(repo.update("parent", { overcomplication: 3 })).rejects.toMatchObject({
      code: DomainErrorCode.PARENT_RATINGS_READ_ONLY
    });
    expect(state.updateCalls).toBe(0);
  });

  it("listTree returns mandatory top-level score sums for every node", async () => {
    const state: DbStubState = {
      selectQueue: [
        [{ id: "ws" }],
        [
          row({
            id: "root",
            parentId: null,
            siblingOrder: 0,
            overcomplication: 5,
            importance: 5,
            blocksMoney: 5
          }),
          row({
            id: "leaf",
            parentId: "root",
            siblingOrder: 0,
            overcomplication: 2,
            importance: null,
            blocksMoney: 1
          })
        ]
      ],
      updateCalls: 0
    };
    const repo = new PostgresWorkItemRepository(createDbStub(state));

    const tree = await repo.listTree("ws");
    const root = tree[0];
    const leaf = root.children[0];

    expect(root).toMatchObject({
      overcomplicationSum: 2,
      importanceSum: 0,
      blocksMoneySum: 1
    });
    expect(leaf).toMatchObject({
      overcomplicationSum: 2,
      importanceSum: 0,
      blocksMoneySum: 1
    });
  });
});
