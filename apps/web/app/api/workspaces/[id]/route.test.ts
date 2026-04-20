import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = {
  rename: vi.fn(),
  delete: vi.fn(),
}

vi.mock("../../../../lib/workspace-repository", () => ({
  getWorkspaceRepository: () => repository,
}))

import { DELETE, PATCH } from "./route"

describe("PATCH /api/workspaces/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renames workspace for non-empty name", async () => {
    repository.rename.mockResolvedValueOnce({
      id: "ws-2",
      name: "Product",
      createdAt: new Date("2026-04-16T08:00:00.000Z"),
      updatedAt: new Date("2026-04-16T08:01:00.000Z"),
    })

    const response = await PATCH(
      new Request("http://localhost/api/workspaces/ws-2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  Product  " }),
      }),
      { params: Promise.resolve({ id: "ws-2" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(repository.rename).toHaveBeenCalledWith("ws-2", { name: "Product" })
    expect(payload.data).toMatchObject({ id: "ws-2", name: "Product" })
  })

  it("rejects empty name", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/workspaces/ws-2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      }),
      { params: Promise.resolve({ id: "ws-2" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("INVALID_PAYLOAD")
    expect(repository.rename).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/workspaces/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("deletes existing workspace", async () => {
    repository.delete.mockResolvedValueOnce(true)

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "ws-2" }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(repository.delete).toHaveBeenCalledWith("ws-2")
    expect(payload.data).toMatchObject({ id: "ws-2", mode: "cascade" })
  })

  it("protects default workspace from deletion", async () => {
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "default-workspace" }),
    })
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toBe("DEFAULT_WORKSPACE_PROTECTED")
    expect(repository.delete).not.toHaveBeenCalled()
  })
})
