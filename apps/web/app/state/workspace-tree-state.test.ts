import { describe, expect, it } from "vitest"
import { normalizeTreeData } from "./workspace-tree-state"

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
