import { describe, expect, it } from "vitest"
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
  it("does not mark orphaned when draft is still present", async () => {
    const treeRef = { current: [makeNode("local-draft:1")] }

    const orphaned = await rollbackCreatedItemIfDraftRemoved(
      "local-draft:1",
      { id: "persisted-1" },
      treeRef,
    )

    expect(orphaned).toBe(false)
  })

  it("marks lineage orphaned when draft was removed before ack", async () => {
    const treeRef = { current: [makeNode("other-row")] }

    const orphaned = await rollbackCreatedItemIfDraftRemoved(
      "local-draft:1",
      { id: "persisted-1" },
      treeRef,
    )

    expect(orphaned).toBe(true)
  })

  it("ignores rollback when persisted payload has no id", async () => {
    const treeRef = { current: [] as WorkTreeNode[] }

    const orphaned = await rollbackCreatedItemIfDraftRemoved(
      "local-draft:1",
      { mode: "cascade" },
      treeRef,
    )

    expect(orphaned).toBe(false)
  })
})
