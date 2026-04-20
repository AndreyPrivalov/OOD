import { describe, expect, it } from "vitest"
import { LocalFirstRowQueue } from "../work-item-editing/save-queue"
import { normalizeTreeData, patchTreeRow } from "./workspace-tree-state"

function createRatingTree(overcomplication: number) {
  return [
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
      overcomplicationSum: overcomplication,
      importanceSum: 3,
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
          overcomplication,
          importance: 3,
          blocksMoney: 1,
          overcomplicationSum: overcomplication,
          importanceSum: 3,
          blocksMoneySum: 1,
          currentProblems: [],
          solutionVariants: [],
          children: [],
        },
      ],
    },
  ]
}

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
  it("recomputes aggregate rating sums for ancestors after a leaf rating patch", () => {
    const tree = [
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
        overcomplicationSum: 2,
        importanceSum: 3,
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

    const patchedTree = patchTreeRow(tree, "leaf", {
      overcomplication: 5,
    })

    expect(patchedTree[0]?.children[0]?.overcomplication).toBe(5)
    expect(patchedTree[0]?.children[0]?.overcomplicationSum).toBe(5)
    expect(patchedTree[0]?.overcomplicationSum).toBe(5)
    expect(patchedTree[0]?.importanceSum).toBe(3)
    expect(patchedTree[0]?.blocksMoneySum).toBe(1)
  })

  it("keeps parent sums stable after confirmed save when optimistic patch already applied", () => {
    const optimisticTree = patchTreeRow(createRatingTree(2), "leaf", {
      overcomplication: 5,
    })
    const confirmedTree = patchTreeRow(optimisticTree, "leaf", {
      overcomplication: 5,
    })

    expect(optimisticTree[0]?.overcomplicationSum).toBe(5)
    expect(confirmedTree[0]?.overcomplicationSum).toBe(5)
  })

  it("does not partially rollback parent sums on stale queued response", () => {
    const queue = new LocalFirstRowQueue<string>()
    queue.enqueue("first")
    queue.startNext()
    queue.enqueue("second")

    const afterFirstOptimistic = patchTreeRow(createRatingTree(2), "leaf", {
      overcomplication: 3,
    })
    let tree = patchTreeRow(afterFirstOptimistic, "leaf", {
      overcomplication: 5,
    })

    const staleAck = queue.acknowledge(1)
    if (staleAck.shouldApply) {
      tree = patchTreeRow(tree, "leaf", { overcomplication: 3 })
    }

    expect(staleAck.shouldApply).toBe(false)
    expect(tree[0]?.overcomplicationSum).toBe(5)
  })

  it("rolls back parent sums after failed save when there is no newer queued request", () => {
    const optimisticTree = patchTreeRow(createRatingTree(2), "leaf", {
      overcomplication: 5,
    })
    const rolledBackTree = patchTreeRow(optimisticTree, "leaf", {
      overcomplication: 2,
    })

    expect(optimisticTree[0]?.overcomplicationSum).toBe(5)
    expect(rolledBackTree[0]?.overcomplicationSum).toBe(2)
  })
})
