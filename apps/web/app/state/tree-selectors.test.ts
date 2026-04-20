import { describe, expect, it } from "vitest"
import { deriveTreeSelectors } from "./tree-selectors"
import {
  type WorkTreeNode,
  applyOptimisticMove,
  patchTreeRow,
} from "./workspace-tree-state"

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

describe("deriveTreeSelectors", () => {
  it("reuses full snapshot identity when tree references are unchanged", () => {
    const tree = [
      makeNode("root", null, 0, [
        makeNode("a", "root", 0),
        makeNode("b", "root", 1),
      ]),
    ]

    const first = deriveTreeSelectors(tree, null)
    const second = deriveTreeSelectors(tree, first)

    expect(second.snapshot).toBe(first.snapshot)
    expect(second.snapshot.rows).toBe(first.snapshot.rows)
    expect(second.snapshot.numberingById).toBe(first.snapshot.numberingById)
    expect(second.snapshot.rowsById).toBe(first.snapshot.rowsById)
    expect(second.snapshot.siblingsByParent).toBe(
      first.snapshot.siblingsByParent,
    )
  })

  it("keeps structure-based maps and updates only changed rows on non-structural patch", () => {
    const tree = [
      makeNode("root", null, 0, [
        makeNode("a", "root", 0),
        makeNode("b", "root", 1),
      ]),
    ]
    const first = deriveTreeSelectors(tree, null)

    const patchedTree = patchTreeRow(tree, "b", { title: "updated" })
    const second = deriveTreeSelectors(patchedTree, first)

    expect(second.snapshot.numberingById).toBe(first.snapshot.numberingById)
    expect(second.snapshot.rowsById.get("a")).toBe(
      first.snapshot.rowsById.get("a"),
    )
    expect(second.snapshot.rowsById.get("b")).not.toBe(
      first.snapshot.rowsById.get("b"),
    )
    expect(second.snapshot.rows[1]).toBe(first.snapshot.rows[1])
    expect(second.snapshot.rows[2]).not.toBe(first.snapshot.rows[2])
  })

  it("rebuilds structure maps when move changes tree shape", () => {
    const tree = [
      makeNode("root", null, 0, [
        makeNode("a", "root", 0),
        makeNode("b", "root", 1),
      ]),
      makeNode("root-2", null, 1),
    ]
    const first = deriveTreeSelectors(tree, null)

    const movedTree = applyOptimisticMove(tree, "b", null, 1)
    const second = deriveTreeSelectors(movedTree, first)

    expect(second.snapshot.numberingById).not.toBe(first.snapshot.numberingById)
    expect(second.snapshot.rowsById).not.toBe(first.snapshot.rowsById)
    expect(second.snapshot.siblingsByParent).not.toBe(
      first.snapshot.siblingsByParent,
    )
    expect(second.snapshot.rowsById.get("b")?.parentId).toBe(null)
  })
})
