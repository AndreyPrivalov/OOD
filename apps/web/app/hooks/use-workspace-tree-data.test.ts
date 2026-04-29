import { describe, expect, it, vi } from "vitest"
import { readSaveRowDeferredError } from "../work-item-editing/save-result"
import {
  finalizeCreatedDraftRow,
  shouldDeferWorkspaceRefresh,
} from "./use-workspace-tree-data"

describe("finalizeCreatedDraftRow", () => {
  it("returns created row when payload has only create fields", async () => {
    const patchRowById = vi.fn()
    const created = {
      id: "server-1",
      title: "Title",
      object: null,
      possiblyRemovable: false,
    }

    const result = await finalizeCreatedDraftRow(
      created,
      { title: "Title" },
      patchRowById,
    )

    expect(result).toEqual(created)
    expect(patchRowById).not.toHaveBeenCalled()
  })

  it("applies post-create patch for non-create fields", async () => {
    const patchRowById = vi.fn().mockResolvedValue({ overcomplication: 4 })
    const created = {
      id: "server-1",
      title: "Title",
      object: null,
      possiblyRemovable: false,
    }

    const result = await finalizeCreatedDraftRow(
      created,
      { title: "Title", overcomplication: 4 },
      patchRowById,
    )

    expect(patchRowById).toHaveBeenCalledWith("server-1", {
      overcomplication: 4,
    })
    expect(result).toEqual({
      ...created,
      overcomplication: 4,
    })
  })

  it("keeps created id and attaches deferred error when post-create patch fails", async () => {
    const patchError = new Error("patch failed")
    const patchRowById = vi.fn().mockRejectedValue(patchError)
    const created = {
      id: "server-1",
      title: "Title",
      object: null,
      possiblyRemovable: false,
    }

    const result = await finalizeCreatedDraftRow(
      created,
      { title: "Title", overcomplication: 4 },
      patchRowById,
    )

    expect((result as { id: string }).id).toBe("server-1")
    expect(readSaveRowDeferredError(result)).toBe(patchError)
  })
})

describe("shouldDeferWorkspaceRefresh", () => {
  it("returns true when refresh is protected by pending save lineage", () => {
    expect(shouldDeferWorkspaceRefresh(() => true)).toBe(true)
  })

  it("returns false when there is no protection callback", () => {
    expect(shouldDeferWorkspaceRefresh(undefined)).toBe(false)
  })
})
