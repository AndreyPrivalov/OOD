import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = {
  listTree: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  deleteCascade: vi.fn(),
}

vi.mock("../../../../../lib/repository", () => ({
  getRepository: () => repository,
}))

import { POST } from "./route"

describe("POST /api/work-items/[id]/move contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns canonical move response", async () => {
    const response = await POST(
      new Request("http://localhost/api/work-items/item-1/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetParentId: "parent-2",
          targetIndex: 3,
        }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(repository.move).toHaveBeenCalledWith("item-1", {
      targetParentId: "parent-2",
      targetIndex: 3,
    })
    expect(payload).toEqual({
      data: {
        id: "item-1",
        targetParentId: "parent-2",
        targetIndex: 3,
      },
    })
  })

  it("uses the shared invalid payload contract", async () => {
    const response = await POST(
      new Request("http://localhost/api/work-items/item-1/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetParentId: "parent-2",
          targetIndex: -1,
        }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("INVALID_PAYLOAD")
    expect(repository.move).not.toHaveBeenCalled()
  })
})
