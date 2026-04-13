import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = {
  listTree: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  deleteCascade: vi.fn(),
  replaceWorkspaceTree: vi.fn()
};

vi.mock("../../../../lib/repository", () => ({
  getRepository: () => repository
}));

import { GET } from "./route";

describe("GET /api/work-items/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns json export by default", async () => {
    repository.listTree.mockResolvedValueOnce([
      {
        id: "root",
        workspaceId: "ws",
        title: "Root",
        object: null,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        currentProblems: [],
        solutionVariants: [],
        overcomplicationSum: 0,
        importanceSum: 0,
        blocksMoneySum: 0,
        children: [
          {
            id: "child",
            workspaceId: "ws",
            title: "Child",
            object: null,
            parentId: "root",
            siblingOrder: 0,
            overcomplication: null,
            importance: null,
            blocksMoney: null,
            currentProblems: [],
            solutionVariants: [],
            overcomplicationSum: 0,
            importanceSum: 0,
            blocksMoneySum: 0,
            children: []
          }
        ]
      }
    ]);

    const response = await GET(
      new Request("http://localhost/api/work-items/export?workspaceId=ws")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.workspaceId).toBe("ws");
    expect(payload.data.rows).toHaveLength(2);
    expect(payload.data.rows[1]).toMatchObject({
      title: "Child",
      path: "Root/Child",
      parentTitle: "Root"
    });
  });

  it("returns csv export when requested", async () => {
    repository.listTree.mockResolvedValueOnce([
      {
        id: "root",
        workspaceId: "ws",
        title: "Root, Title",
        object: null,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        currentProblems: [],
        solutionVariants: [],
        overcomplicationSum: 0,
        importanceSum: 0,
        blocksMoneySum: 0,
        children: []
      }
    ]);

    const response = await GET(
      new Request("http://localhost/api/work-items/export?workspaceId=ws&format=csv")
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(csv).toContain("id,title,path,parentTitle,siblingOrder");
    expect(csv).toContain('"Root, Title"');
  });
});
