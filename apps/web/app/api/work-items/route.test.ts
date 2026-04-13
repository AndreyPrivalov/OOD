import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = {
  listTree: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  deleteCascade: vi.fn()
};

vi.mock("../../../lib/repository", () => ({
  getRepository: () => repository
}));

import { GET, POST } from "./route";

describe("GET /api/work-items contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mandatory top-level score sums for every node", async () => {
    repository.listTree.mockResolvedValueOnce([
      {
        id: "root",
        workspaceId: "ws",
        title: "root",
        object: null,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        overcomplicationSum: undefined,
        importanceSum: undefined,
        blocksMoneySum: undefined,
        currentProblems: [],
        solutionVariants: [],
        children: [
          {
            id: "leaf",
            workspaceId: "ws",
            title: "leaf",
            object: null,
            parentId: "root",
            siblingOrder: 0,
            overcomplication: 2,
            importance: 3,
            blocksMoney: 1,
            overcomplicationSum: undefined,
            importanceSum: 3,
            blocksMoneySum: undefined,
            currentProblems: [],
            solutionVariants: [],
            children: []
          }
        ]
      }
    ]);

    const response = await GET(
      new Request("http://localhost/api/work-items?workspaceId=ws")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({
      overcomplicationSum: 0,
      importanceSum: 0,
      blocksMoneySum: 0
    });
    expect(payload.data[0].children[0]).toMatchObject({
      overcomplicationSum: 0,
      importanceSum: 3,
      blocksMoneySum: 0
    });
  });

  it("keeps legacy aggregate values instead of overriding them with zero", async () => {
    repository.listTree.mockResolvedValueOnce([
      {
        id: "root",
        workspaceId: "ws",
        title: "root",
        object: null,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        overcomplicationSum: undefined,
        importanceSum: undefined,
        blocksMoneySum: undefined,
        overcomplication_sum: "4",
        importance_sum: 3,
        blocks_money_sum: 2,
        aggregates: {
          overcomplicationSum: 4,
          importanceSum: 3,
          blocksMoneySum: 2
        },
        currentProblems: [],
        solutionVariants: [],
        children: []
      }
    ]);

    const response = await GET(
      new Request("http://localhost/api/work-items?workspaceId=ws")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({
      overcomplicationSum: 4,
      importanceSum: 3,
      blocksMoneySum: 2
    });
  });

  it("accepts and returns possiblyRemovable for create contract", async () => {
    repository.create.mockResolvedValueOnce({
      id: "new-item",
      workspaceId: "ws",
      title: "New",
      object: null,
      possiblyRemovable: true,
      parentId: null,
      siblingOrder: 0,
      overcomplication: null,
      importance: null,
      blocksMoney: null,
      currentProblems: [],
      solutionVariants: []
    });

    const response = await POST(
      new Request("http://localhost/api/work-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "ws",
          title: "New",
          possiblyRemovable: true
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws",
        title: "New",
        possiblyRemovable: true
      })
    );
    expect(payload.data).toMatchObject({
      id: "new-item",
      possiblyRemovable: true
    });
  });
});
