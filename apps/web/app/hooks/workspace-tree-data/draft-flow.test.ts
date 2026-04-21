import { describe, expect, it, vi } from "vitest"
import type { WorkTreeNode } from "../../state/workspace-tree-state"
import { rollbackCreatedItemIfDraftRemoved } from "./draft-flow"

function makeNode(id: string): WorkTreeNode {
  return {
    id,
    workspaceId: "ws-1",
    title: "Row",
    object: null,
    possiblyRemovable: false,
    parentId: null,
    siblingOrder: 0,
    overcomplication: null,
    importance: null,
    metricValues: {},
    metricAggregates: {},
    currentProblems: [],
    solutionVariants: [],
    children: [],
  }
}

describe("rollbackCreatedItemIfDraftRemoved", () => {
  it("does not rollback when draft is still present", async () => {
    const deleteById = vi.fn()
    const treeRef = { current: [makeNode("local-draft:1")] }

    await rollbackCreatedItemIfDraftRemoved(
      "local-draft:1",
      { id: "persisted-1" },
      treeRef,
      deleteById,
    )

    expect(deleteById).not.toHaveBeenCalled()
  })

  it("rolls back persisted row when draft was removed", async () => {
    const deleteById = vi.fn().mockResolvedValue(undefined)
    const treeRef = { current: [makeNode("other-row")] }

    await rollbackCreatedItemIfDraftRemoved(
      "local-draft:1",
      { id: "persisted-1" },
      treeRef,
      deleteById,
    )

    expect(deleteById).toHaveBeenCalledWith("persisted-1")
  })

  it("ignores rollback when persisted payload has no id", async () => {
    const deleteById = vi.fn()
    const treeRef = { current: [] as WorkTreeNode[] }

    await rollbackCreatedItemIfDraftRemoved(
      "local-draft:1",
      { mode: "cascade" },
      treeRef,
      deleteById,
    )

    expect(deleteById).not.toHaveBeenCalled()
  })
})
