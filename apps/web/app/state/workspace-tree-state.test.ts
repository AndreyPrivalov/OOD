import { describe, expect, it } from "vitest"
import {
  applyOptimisticMove,
  normalizeTreeData,
  patchTreeRow,
} from "./workspace-tree-state"

describe("normalizeTreeData", () => {
  it("accepts only canonical nested tree payload", () => {
    const payload = [
      {
        id: "root",
        workspaceId: "ws",
        title: "Root",
        object: null,
        possiblyRemovable: false,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        overcomplicationSum: 0,
        importanceSum: 0,
        blocksMoneySum: 0,
        currentProblems: [],
        solutionVariants: [],
        children: [
          {
            id: "leaf",
            workspaceId: "ws",
            title: "Leaf",
            object: null,
            possiblyRemovable: true,
            parentId: "root",
            siblingOrder: 0,
            overcomplication: 2,
            importance: 3,
            blocksMoney: 1,
            overcomplicationSum: 2,
            importanceSum: 3,
            blocksMoneySum: 1,
            currentProblems: [],
            solutionVariants: [],
            children: [],
          },
        ],
      },
    ]

    expect(normalizeTreeData(payload)).toEqual(payload)
  })

  it("drops legacy flat payload", () => {
    const legacyPayload = [
      {
        id: "root",
        workspaceId: "ws",
        title: "Root",
        object: null,
        possiblyRemovable: false,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        currentProblems: [],
        solutionVariants: [],
      },
      {
        id: "leaf",
        workspaceId: "ws",
        title: "Leaf",
        object: null,
        possiblyRemovable: true,
        parentId: "root",
        siblingOrder: 0,
        overcomplication: 2,
        importance: 3,
        blocksMoney: 1,
        currentProblems: [],
        solutionVariants: [],
      },
    ]

    expect(normalizeTreeData(legacyPayload)).toEqual([])
  })
})

describe("patchTreeRow", () => {
  it("recomputes parent rating sums after leaf rating patch", () => {
    const tree = normalizeTreeData([
      {
        id: "root",
        workspaceId: "ws",
        title: "Root",
        object: null,
        possiblyRemovable: false,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        overcomplicationSum: 3,
        importanceSum: 2,
        blocksMoneySum: 1,
        currentProblems: [],
        solutionVariants: [],
        children: [
          {
            id: "leaf",
            workspaceId: "ws",
            title: "Leaf",
            object: null,
            possiblyRemovable: true,
            parentId: "root",
            siblingOrder: 0,
            overcomplication: 3,
            importance: 2,
            blocksMoney: 1,
            overcomplicationSum: 3,
            importanceSum: 2,
            blocksMoneySum: 1,
            currentProblems: [],
            solutionVariants: [],
            children: [],
          },
        ],
      },
    ])

    const patched = patchTreeRow(tree, "leaf", { importance: 5 })
    const root = patched[0]
    const leaf = root.children[0]

    expect(leaf.importance).toBe(5)
    expect(leaf.importanceSum).toBe(5)
    expect(root.importanceSum).toBe(5)
  })
})

describe("applyOptimisticMove", () => {
  it("recomputes source and destination parent sums after move", () => {
    const tree = normalizeTreeData([
      {
        id: "root-a",
        workspaceId: "ws",
        title: "Root A",
        object: null,
        possiblyRemovable: false,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        overcomplicationSum: 4,
        importanceSum: 0,
        blocksMoneySum: 0,
        currentProblems: [],
        solutionVariants: [],
        children: [
          {
            id: "leaf-a",
            workspaceId: "ws",
            title: "Leaf A",
            object: null,
            possiblyRemovable: false,
            parentId: "root-a",
            siblingOrder: 0,
            overcomplication: 4,
            importance: 0,
            blocksMoney: 0,
            overcomplicationSum: 4,
            importanceSum: 0,
            blocksMoneySum: 0,
            currentProblems: [],
            solutionVariants: [],
            children: [],
          },
        ],
      },
      {
        id: "root-b",
        workspaceId: "ws",
        title: "Root B",
        object: null,
        possiblyRemovable: false,
        parentId: null,
        siblingOrder: 1,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        overcomplicationSum: 0,
        importanceSum: 0,
        blocksMoneySum: 0,
        currentProblems: [],
        solutionVariants: [],
        children: [],
      },
    ])

    const moved = applyOptimisticMove(tree, "leaf-a", "root-b", 0)
    const rootA = moved.find((node) => node.id === "root-a")
    const rootB = moved.find((node) => node.id === "root-b")

    expect(rootA?.overcomplicationSum).toBe(0)
    expect(rootB?.overcomplicationSum).toBe(4)
  })
})
