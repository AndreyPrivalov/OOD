import { describe, expect, it } from "vitest"
import {
  type WorkspaceTreeProjectionCache,
  deriveWorkspaceTreeProjection,
} from "./workspace-tree-projection"
import { applyOptimisticMove, patchTreeRow } from "./workspace-tree-state"
import type { WorkTreeNode } from "./workspace-tree-state"

function makeNode(
  id: string,
  parentId: string | null,
  siblingOrder: number,
  children: WorkTreeNode[] = [],
): WorkTreeNode {
  return {
    id,
    workspaceId: "ws-1",
    title: id,
    object: null,
    possiblyRemovable: true,
    parentId,
    siblingOrder,
    overcomplication: null,
    importance: null,
    currentProblems: [],
    solutionVariants: [],
    children,
  }
}

function project(
  tree: WorkTreeNode[],
  collapsedRowIds: Set<string>,
  previousCache: WorkspaceTreeProjectionCache | null,
) {
  return deriveWorkspaceTreeProjection({
    tree,
    collapsedRowIds,
    previousCache,
  })
}

describe("deriveWorkspaceTreeProjection", () => {
  it("reuses projection snapshot identity when tree and collapsed set reference are unchanged", () => {
    const tree = [
      makeNode("root", null, 0, [
        makeNode("a", "root", 0),
        makeNode("b", "root", 1),
      ]),
    ]
    const collapsed = new Set<string>(["root"])

    const first = project(tree, collapsed, null)
    const second = project(tree, collapsed, first)

    expect(second.snapshot).toBe(first.snapshot)
  })

  it("keeps canonical projection stable while recomputing only table visibility on collapse changes", () => {
    const tree = [
      makeNode("root", null, 0, [
        makeNode("a", "root", 0),
        makeNode("b", "root", 1),
      ]),
    ]

    const first = project(tree, new Set<string>(["root"]), null)
    const second = project(tree, new Set<string>(), first)

    expect(second.snapshot.canonical).toBe(first.snapshot.canonical)
    expect(second.snapshot.table.rows.map((row) => row.id)).toEqual([
      "root",
      "a",
      "b",
    ])
    expect(second.snapshot.mindmap.rows).toBe(second.snapshot.canonical.rows)
  })

  it("keeps shared mindmap projection stable when only collapse visibility changes", () => {
    const tree = [
      makeNode("root", null, 0, [
        makeNode("a", "root", 0),
        makeNode("b", "root", 1),
      ]),
    ]
    const first = project(tree, new Set<string>(["root"]), null)
    const second = project(tree, new Set<string>(), first)

    expect(first.snapshot.table.rows.map((row) => row.id)).toEqual(["root"])
    expect(second.snapshot.table.rows.map((row) => row.id)).toEqual([
      "root",
      "a",
      "b",
    ])
    expect(second.snapshot.mindmap).toBe(first.snapshot.mindmap)
    expect(second.snapshot.mindmap.rows).toBe(second.snapshot.canonical.rows)
  })

  it("reuses table projection when collapsed set instance changes but content stays equal", () => {
    const tree = [
      makeNode("root", null, 0, [
        makeNode("a", "root", 0),
        makeNode("b", "root", 1),
      ]),
    ]
    const first = project(tree, new Set<string>(["root"]), null)
    const second = project(tree, new Set<string>(["root"]), first)

    expect(second.snapshot.table.rows).toBe(first.snapshot.table.rows)
    expect(second.snapshot.mindmap).toBe(first.snapshot.mindmap)
  })

  it("keeps table and mindmap projections aligned after optimistic tree updates", () => {
    const tree = [
      makeNode("root", null, 0, [
        makeNode("a", "root", 0),
        makeNode("b", "root", 1),
      ]),
      makeNode("root-2", null, 1),
    ]

    const first = project(tree, new Set<string>(), null)
    const movedTree = applyOptimisticMove(tree, "b", null, 1)
    const second = project(movedTree, new Set<string>(), first)
    const patchedTree = patchTreeRow(movedTree, "b", { title: "updated" })
    const third = project(patchedTree, new Set<string>(), second)

    expect(second.snapshot.table.rows.map((row) => row.id)).toEqual(
      second.snapshot.mindmap.rows.map((row) => row.id),
    )
    expect(third.snapshot.table.rows.find((row) => row.id === "b")?.title).toBe(
      "updated",
    )
    expect(third.snapshot.mindmap.rowsById.get("b")?.title).toBe("updated")
  })
})
