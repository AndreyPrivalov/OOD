import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = {
  delete: vi.fn(),
}

vi.mock("../../../../lib/workspace-repository", () => ({
  getWorkspaceRepository: () => repository,
}))

import { DELETE } from "./route"

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
