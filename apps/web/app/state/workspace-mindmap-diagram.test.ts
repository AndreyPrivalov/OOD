import { describe, expect, it } from "vitest"
import {
  buildActiveNodeIds,
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
    expect(diagram.nodes[0]?.height).toBe(22)
  })

  it("centers children vertically around parent", () => {
    const rows: FlatRow[] = [
      buildRow({ id: "root", title: "Root", depth: 0 }),
      buildRow({
        id: "child-a",
        title: "Child A",
        parentId: "root",
        depth: 1,
        siblingOrder: 0,
      }),
      buildRow({
        id: "child-b",
        title: "Child B",
        parentId: "root",
        depth: 1,
        siblingOrder: 1,
      }),
    ]

    const diagram = buildWorkspaceMindmapDiagram(rows)
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
    const root = byId.get("root")
    const childA = byId.get("child-a")
    const childB = byId.get("child-b")
    expect(root).toBeTruthy()
    expect(childA).toBeTruthy()
    expect(childB).toBeTruthy()

    const rootCenterY = (root?.y ?? 0) + (root?.height ?? 0) / 2
    const childACenterY = (childA?.y ?? 0) + (childA?.height ?? 0) / 2
    const childBCenterY = (childB?.y ?? 0) + (childB?.height ?? 0) / 2
    expect(rootCenterY).toBe((childACenterY + childBCenterY) / 2)
  })

  it("uses node width based on label length", () => {
    const rows: FlatRow[] = [
      buildRow({ id: "short", title: "A", depth: 0 }),
      buildRow({
        id: "long",
        title: "Очень длинный заголовок узла",
        depth: 0,
        siblingOrder: 1,
      }),
    ]

    const diagram = buildWorkspaceMindmapDiagram(rows)
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
    const short = byId.get("short")
    const long = byId.get("long")
    expect(short).toBeTruthy()
    expect(long).toBeTruthy()
    expect((short?.width ?? 0) < (long?.width ?? 0)).toBe(true)
  })

  it("positions parent by median child center for uneven branches", () => {
    const rows: FlatRow[] = [
      buildRow({ id: "root", title: "Root", depth: 0 }),
      buildRow({
        id: "child-a",
        title: "Child A",
        parentId: "root",
        depth: 1,
        siblingOrder: 0,
      }),
      buildRow({
        id: "leaf-a1",
        title: "Leaf A1",
        parentId: "child-a",
        depth: 2,
        siblingOrder: 0,
      }),
      buildRow({
        id: "leaf-a2",
        title: "Leaf A2",
        parentId: "child-a",
        depth: 2,
        siblingOrder: 1,
      }),
      buildRow({
        id: "child-b",
        title: "Child B",
        parentId: "root",
        depth: 1,
        siblingOrder: 1,
      }),
      buildRow({
        id: "child-c",
        title: "Child C",
        parentId: "root",
        depth: 1,
        siblingOrder: 2,
      }),
    ]

    const diagram = buildWorkspaceMindmapDiagram(rows)
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
    const root = byId.get("root")
    const childA = byId.get("child-a")
    const childB = byId.get("child-b")
    const childC = byId.get("child-c")

    expect(root).toBeTruthy()
    expect(childA).toBeTruthy()
    expect(childB).toBeTruthy()
    expect(childC).toBeTruthy()

    const rootCenterY = (root?.y ?? 0) + (root?.height ?? 0) / 2
    const childBCenterY = (childB?.y ?? 0) + (childB?.height ?? 0) / 2
    const childACenterY = (childA?.y ?? 0) + (childA?.height ?? 0) / 2
    const childCCenterY = (childC?.y ?? 0) + (childC?.height ?? 0) / 2

    expect(rootCenterY).toBe(childBCenterY)
    expect(rootCenterY).not.toBe((childACenterY + childCCenterY) / 2)
  })

  it("adds extra spacing between neighboring non-leaf branches only", () => {
    const rows: FlatRow[] = [
      buildRow({ id: "root", title: "Root", depth: 0 }),
      buildRow({
        id: "branch-a",
        title: "Branch A",
        parentId: "root",
        depth: 1,
        siblingOrder: 0,
      }),
      buildRow({
        id: "branch-b",
        title: "Branch B",
        parentId: "root",
        depth: 1,
        siblingOrder: 1,
      }),
      buildRow({
        id: "leaf-c",
        title: "Leaf C",
        parentId: "root",
        depth: 1,
        siblingOrder: 2,
      }),
      buildRow({
        id: "leaf-a",
        title: "Leaf A",
        parentId: "branch-a",
        depth: 2,
        siblingOrder: 0,
      }),
      buildRow({
        id: "leaf-b",
        title: "Leaf B",
        parentId: "branch-b",
        depth: 2,
        siblingOrder: 0,
      }),
    ]

    const diagram = buildWorkspaceMindmapDiagram(rows)
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
    const branchA = byId.get("branch-a")
    const branchB = byId.get("branch-b")
    const leafC = byId.get("leaf-c")

    expect(branchA).toBeTruthy()
    expect(branchB).toBeTruthy()
    expect(leafC).toBeTruthy()

    const aCenterY = (branchA?.y ?? 0) + (branchA?.height ?? 0) / 2
    const bCenterY = (branchB?.y ?? 0) + (branchB?.height ?? 0) / 2
    const cCenterY = (leafC?.y ?? 0) + (leafC?.height ?? 0) / 2

    expect(bCenterY - aCenterY).toBeGreaterThan(cCenterY - bCenterY)
  })

  it("keeps internal spacing tighter than external branch spacing", () => {
    const rows: FlatRow[] = [
      buildRow({ id: "root", title: "Root", depth: 0 }),
      buildRow({
        id: "branch-a",
        title: "Branch A",
        parentId: "root",
        depth: 1,
        siblingOrder: 0,
      }),
      buildRow({
        id: "leaf-a1",
        title: "Leaf A1",
        parentId: "branch-a",
        depth: 2,
        siblingOrder: 0,
      }),
      buildRow({
        id: "leaf-a2",
        title: "Leaf A2",
        parentId: "branch-a",
        depth: 2,
        siblingOrder: 1,
      }),
      buildRow({
        id: "branch-b",
        title: "Branch B",
        parentId: "root",
        depth: 1,
        siblingOrder: 1,
      }),
      buildRow({
        id: "leaf-b1",
        title: "Leaf B1",
        parentId: "branch-b",
        depth: 2,
        siblingOrder: 0,
      }),
      buildRow({
        id: "leaf-b2",
        title: "Leaf B2",
        parentId: "branch-b",
        depth: 2,
        siblingOrder: 1,
      }),
    ]

    const diagram = buildWorkspaceMindmapDiagram(rows)
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
    const leafA1 = byId.get("leaf-a1")
    const leafA2 = byId.get("leaf-a2")
    const leafB1 = byId.get("leaf-b1")
    expect(leafA1).toBeTruthy()
    expect(leafA2).toBeTruthy()
    expect(leafB1).toBeTruthy()

    const a1CenterY = (leafA1?.y ?? 0) + (leafA1?.height ?? 0) / 2
    const a2CenterY = (leafA2?.y ?? 0) + (leafA2?.height ?? 0) / 2
    const b1CenterY = (leafB1?.y ?? 0) + (leafB1?.height ?? 0) / 2

    const internalGap = a2CenterY - a1CenterY
    const externalGap = b1CenterY - a2CenterY

    expect(externalGap).toBeGreaterThan(internalGap)
  })

  it("includes editing row, one parent level, sibling level and one child level", () => {
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
    const grandchildA = buildRow({
      id: "grandchild-a",
      title: "Grandchild A",
      parentId: "child-a",
      depth: 2,
      siblingOrder: 0,
    })

    const context = buildEditingContextNodeIds({
      editingContextRowId: "child-a",
      rowsById: new Map([
        [root.id, root],
        [childA.id, childA],
        [childB.id, childB],
        [grandchildA.id, grandchildA],
      ]),
      siblingsByParent: new Map([
        [null, [root]],
        ["root", [childA, childB]],
        ["child-a", [grandchildA]],
      ]),
    })

    expect(context).toEqual(["child-a", "grandchild-a", "root", "child-b"])
  })

  it("includes extended parent chain for leaf editing row", () => {
    const root = buildRow({ id: "root", title: "Root", depth: 0 })
    const parent = buildRow({
      id: "parent",
      title: "Parent",
      parentId: "root",
      depth: 1,
      siblingOrder: 0,
    })
    const leaf = buildRow({
      id: "leaf",
      title: "Leaf",
      parentId: "parent",
      depth: 2,
      siblingOrder: 0,
    })
    const parentSibling = buildRow({
      id: "parent-sibling",
      title: "Parent Sibling",
      parentId: "root",
      depth: 1,
      siblingOrder: 1,
    })

    const context = buildEditingContextNodeIds({
      editingContextRowId: "leaf",
      rowsById: new Map([
        [root.id, root],
        [parent.id, parent],
        [leaf.id, leaf],
        [parentSibling.id, parentSibling],
      ]),
      siblingsByParent: new Map([
        [null, [root]],
        ["root", [parent, parentSibling]],
        ["parent", [leaf]],
      ]),
    })

    expect(context).toEqual(["leaf", "parent", "root"])
  })

  it("includes root-level siblings and first-level children when editing row is root", () => {
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

    expect(context).toEqual(["root-a", "child", "root-b"])
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

  it("includes active row and its first-level children", () => {
    const childA = buildRow({
      id: "child-a",
      title: "Child A",
      parentId: "root",
      depth: 1,
    })
    const childB = buildRow({
      id: "child-b",
      title: "Child B",
      parentId: "root",
      depth: 1,
    })
    const root = buildRow({
      id: "root",
      title: "Root",
      depth: 0,
      children: [childA, childB],
    })

    const activeNodeIds = buildActiveNodeIds({
      activeRowId: "root",
      rowsById: new Map([
        [root.id, root],
        [childA.id, childA],
        [childB.id, childB],
      ]),
    })

    expect(activeNodeIds).toEqual(["root", "child-a", "child-b"])
  })

  it("returns empty active ids for missing active row", () => {
    const root = buildRow({
      id: "root",
      title: "Root",
      depth: 0,
    })

    expect(
      buildActiveNodeIds({
        activeRowId: null,
        rowsById: new Map([[root.id, root]]),
      }),
    ).toEqual([])
    expect(
      buildActiveNodeIds({
        activeRowId: "missing",
        rowsById: new Map([[root.id, root]]),
      }),
    ).toEqual([])
  })
})
