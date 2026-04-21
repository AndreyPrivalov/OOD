import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = {
  listTree: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  deleteCascade: vi.fn(),
  restoreBranch: vi.fn(),
}

vi.mock("../../../../lib/repository", () => ({
  getRepository: () => repository,
}))

import { POST } from "./route"

describe("POST /api/work-items/restore contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("accepts canonical restore payload and returns idMap", async () => {
    repository.restoreBranch.mockResolvedValueOnce({
      "branch-1": "branch-1",
      "leaf-1": "leaf-1",
    })

    const response = await POST(
      new Request("http://localhost/api/work-items/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "ws",
          targetParentId: null,
          targetIndex: 0,
          root: {
            id: "branch-1",
            workspaceId: "ws",
            title: "Branch",
            object: null,
            possiblyRemovable: false,
            parentId: null,
            siblingOrder: 0,
            overcomplication: null,
            importance: null,
            currentProblems: [],
            solutionVariants: [],
            children: [
              {
                id: "leaf-1",
                workspaceId: "ws",
                title: "Leaf",
                object: null,
                possiblyRemovable: false,
                parentId: "branch-1",
                siblingOrder: 0,
                overcomplication: 2,
                importance: null,
                currentProblems: [],
                solutionVariants: [],
                children: [],
              },
            ],
          },
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(repository.restoreBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws",
        targetIndex: 0,
      }),
    )
    expect(payload).toEqual({
      data: {
        idMap: {
          "branch-1": "branch-1",
          "leaf-1": "leaf-1",
        },
      },
    })
  })

  it("uses the shared invalid payload contract for malformed restore payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/work-items/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "ws",
          targetParentId: null,
          targetIndex: -1,
          root: null,
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("INVALID_PAYLOAD")
    expect(repository.restoreBranch).not.toHaveBeenCalled()
  })
})
