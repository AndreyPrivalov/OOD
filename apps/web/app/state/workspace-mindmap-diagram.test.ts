import { describe, expect, it } from "vitest"
import {
  buildEditingContextNodeIds,
  buildWorkspaceMindmapDiagram,
} from "./workspace-mindmap-diagram"
import type { FlatRow } from "./workspace-tree-state"

function buildRow(
  input: Partial<FlatRow> & Pick<FlatRow, "id" | "title">,
): FlatRow {
  return {
    id: input.id,
    workspaceId: input.workspaceId ?? "ws-1",
    title: input.title,
    object: input.object ?? null,
    possiblyRemovable: input.possiblyRemovable ?? false,
    parentId: input.parentId ?? null,
    siblingOrder: input.siblingOrder ?? 0,
    overcomplication: input.overcomplication ?? null,
    importance: input.importance ?? null,
    metricValues: input.metricValues ?? {},
    metricAggregates: input.metricAggregates ?? {},
    currentProblems: input.currentProblems ?? [],
    solutionVariants: input.solutionVariants ?? [],
    children: input.children ?? [],
    depth: input.depth ?? 0,
  }
}

describe("workspace-mindmap-diagram", () => {
  it("builds nodes and edges from flat rows", () => {
    const rows: FlatRow[] = [
      buildRow({ id: "root", title: "Root", depth: 0 }),
      buildRow({ id: "child", title: "Child", parentId: "root", depth: 1 }),
    ]

    const diagram = buildWorkspaceMindmapDiagram(rows)

    expect(diagram.nodes).toHaveLength(2)
    expect(diagram.edges).toEqual([
      {
        id: "root__child",
        fromId: "root",
        toId: "child",
      },
    ])
    expect(diagram.nodes[1]?.x).toBeGreaterThan(diagram.nodes[0]?.x ?? 0)
  })

  it("includes editing row, parent and siblings for nested context", () => {
    const root = buildRow({ id: "root", title: "Root", depth: 0 })
    const childA = buildRow({
      id: "child-a",
      title: "Child A",
      parentId: "root",
      depth: 1,
      siblingOrder: 0,
    })
    const childB = buildRow({
      id: "child-b",
      title: "Child B",
      parentId: "root",
      depth: 1,
      siblingOrder: 1,
    })

    const context = buildEditingContextNodeIds({
      editingContextRowId: "child-a",
      rowsById: new Map([
        [root.id, root],
        [childA.id, childA],
        [childB.id, childB],
      ]),
      siblingsByParent: new Map([
        [null, [root]],
        ["root", [childA, childB]],
      ]),
    })

    expect(context).toEqual(["child-a", "root", "child-b"])
  })

  it("includes root-level siblings when editing row is root", () => {
    const rootA = buildRow({
      id: "root-a",
      title: "Root A",
      depth: 0,
      siblingOrder: 0,
    })
    const rootB = buildRow({
      id: "root-b",
      title: "Root B",
      depth: 0,
      siblingOrder: 1,
    })
    const child = buildRow({
      id: "child",
      title: "Child",
      parentId: "root-a",
      depth: 1,
      siblingOrder: 0,
    })

    const context = buildEditingContextNodeIds({
      editingContextRowId: "root-a",
      rowsById: new Map([
        [rootA.id, rootA],
        [rootB.id, rootB],
        [child.id, child],
      ]),
      siblingsByParent: new Map([
        [null, [rootA, rootB]],
        ["root-a", [child]],
      ]),
    })

    expect(context).toEqual(["root-a", "root-b"])
  })

  it("returns empty editing context for missing or empty editing target", () => {
    const root = buildRow({
      id: "root",
      title: "Root",
      depth: 0,
    })
    const rowsById = new Map([[root.id, root]])
    const siblingsByParent = new Map<string | null, FlatRow[]>([[null, [root]]])

    expect(
      buildEditingContextNodeIds({
        editingContextRowId: null,
        rowsById,
        siblingsByParent,
      }),
    ).toEqual([])

    expect(
      buildEditingContextNodeIds({
        editingContextRowId: "missing",
        rowsById,
        siblingsByParent,
      }),
    ).toEqual([])
  })
})
