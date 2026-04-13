import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = {
  listTree: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  deleteCascade: vi.fn(),
  replaceWorkspaceTree: vi.fn(),
}

const { importWorkItemsFromGoogleSheet } = vi.hoisted(() => ({
  importWorkItemsFromGoogleSheet: vi.fn(),
}))

vi.mock("../../../../../lib/repository", () => ({
  getRepository: () => repository,
}))

vi.mock("../../../../../lib/google-sheet-import", () => ({
  importWorkItemsFromGoogleSheet,
}))

import { POST } from "./route"

describe("POST /api/work-items/import/google-sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("validates payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/work-items/import/google-sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "replace" }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("INVALID_PAYLOAD")
    expect(importWorkItemsFromGoogleSheet).not.toHaveBeenCalled()
  })

  it("returns import result on success", async () => {
    importWorkItemsFromGoogleSheet.mockResolvedValueOnce({
      workspaceId: "default-workspace",
      mode: "replace",
      dryRun: true,
      source: "csv",
      rowCount: 2,
      nodeCount: 2,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      actions: [],
    })

    const response = await POST(
      new Request("http://localhost/api/work-items/import/google-sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sheetId: "sheet-1",
          mode: "replace",
          dryRun: true,
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(importWorkItemsFromGoogleSheet).toHaveBeenCalledWith(
      {
        sheetId: "sheet-1",
        mode: "replace",
        dryRun: true,
      },
      { repository },
    )
    expect(payload.data).toMatchObject({
      source: "csv",
      dryRun: true,
    })
  })
})
