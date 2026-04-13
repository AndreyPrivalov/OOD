import { DomainErrorCode } from "@ood/domain";
import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetInMemoryStoreForTests,
  InMemoryWorkItemRepository
} from "./repository";

type TreeNode = Awaited<ReturnType<InMemoryWorkItemRepository["listTree"]>>[number];

function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findNode(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

describe("InMemoryWorkItemRepository listTree score sums", () => {
  const workspaceId = "ws-sums";

  beforeEach(() => {
    __resetInMemoryStoreForTests();
  });

  it("returns leaf sums from own ratings and parent sums from leaf descendants", async () => {
    const repo = new InMemoryWorkItemRepository();
    const root = await repo.create({
      workspaceId,
      title: "root",
      overcomplication: 5,
      importance: 5,
      blocksMoney: 5
    });
    const parent = await repo.create({
      workspaceId,
      parentId: root.id,
      title: "parent",
      overcomplication: 4,
      importance: 4,
      blocksMoney: 4
    });
    await repo.create({
      workspaceId,
      parentId: parent.id,
      title: "leaf-a",
      overcomplication: 2,
      importance: 3,
      blocksMoney: 1
    });
    const leafB = await repo.create({
      workspaceId,
      parentId: parent.id,
      title: "leaf-b",
      overcomplication: null,
      importance: 4,
      blocksMoney: null
    });

    const tree = await repo.listTree(workspaceId);
    const rootNode = findNode(tree, root.id);
    const parentNode = findNode(tree, parent.id);
    const leafBNode = findNode(tree, leafB.id);

    expect(parentNode?.overcomplicationSum).toBe(2);
    expect(parentNode?.importanceSum).toBe(7);
    expect(parentNode?.blocksMoneySum).toBe(1);
    expect(rootNode?.overcomplicationSum).toBe(2);
    expect(rootNode?.importanceSum).toBe(7);
    expect(rootNode?.blocksMoneySum).toBe(1);

    expect(leafBNode?.overcomplicationSum).toBe(0);
    expect(leafBNode?.importanceSum).toBe(4);
    expect(leafBNode?.blocksMoneySum).toBe(0);
  });

  it("recalculates sums after moving a branch", async () => {
    const repo = new InMemoryWorkItemRepository();
    const root = await repo.create({ workspaceId, title: "root" });
    const parentA = await repo.create({ workspaceId, parentId: root.id, title: "A" });
    const parentB = await repo.create({ workspaceId, parentId: root.id, title: "B" });
    const leafA = await repo.create({
      workspaceId,
      parentId: parentA.id,
      title: "leaf-a",
      overcomplication: 2,
      importance: 1,
      blocksMoney: 3
    });
    await repo.create({
      workspaceId,
      parentId: parentB.id,
      title: "leaf-b",
      overcomplication: 1,
      importance: 2,
      blocksMoney: 0
    });

    await repo.move(leafA.id, { targetParentId: parentB.id, targetIndex: 0 });
    const tree = await repo.listTree(workspaceId);
    const aNode = findNode(tree, parentA.id);
    const bNode = findNode(tree, parentB.id);
    const rootNode = findNode(tree, root.id);

    expect(aNode?.overcomplicationSum).toBe(0);
    expect(aNode?.importanceSum).toBe(0);
    expect(aNode?.blocksMoneySum).toBe(0);

    expect(bNode?.overcomplicationSum).toBe(3);
    expect(bNode?.importanceSum).toBe(3);
    expect(bNode?.blocksMoneySum).toBe(3);

    expect(rootNode?.overcomplicationSum).toBe(3);
    expect(rootNode?.importanceSum).toBe(3);
    expect(rootNode?.blocksMoneySum).toBe(3);
  });

  it("recalculates sums after deleting a branch", async () => {
    const repo = new InMemoryWorkItemRepository();
    const root = await repo.create({ workspaceId, title: "root" });
    const keepParent = await repo.create({ workspaceId, parentId: root.id, title: "keep" });
    const deleteParent = await repo.create({ workspaceId, parentId: root.id, title: "delete" });
    await repo.create({
      workspaceId,
      parentId: keepParent.id,
      title: "keep-leaf",
      overcomplication: 2,
      importance: 2,
      blocksMoney: 2
    });
    await repo.create({
      workspaceId,
      parentId: deleteParent.id,
      title: "delete-leaf",
      overcomplication: 4,
      importance: 4,
      blocksMoney: 4
    });

    await repo.deleteCascade(deleteParent.id);
    const tree = await repo.listTree(workspaceId);
    const rootNode = findNode(tree, root.id);
    const removedNode = findNode(tree, deleteParent.id);

    expect(removedNode).toBeUndefined();
    expect(rootNode?.overcomplicationSum).toBe(2);
    expect(rootNode?.importanceSum).toBe(2);
    expect(rootNode?.blocksMoneySum).toBe(2);
  });

  it("rejects rating updates for parent nodes", async () => {
    const repo = new InMemoryWorkItemRepository();
    const root = await repo.create({ workspaceId, title: "root" });
    const parent = await repo.create({ workspaceId, parentId: root.id, title: "parent" });
    await repo.create({ workspaceId, parentId: parent.id, title: "leaf" });

    await expect(repo.update(parent.id, { importance: 3 })).rejects.toMatchObject({
      code: DomainErrorCode.PARENT_RATINGS_READ_ONLY
    });
  });

  it("defaults possiblyRemovable to false on create", async () => {
    const repo = new InMemoryWorkItemRepository();
    const item = await repo.create({ workspaceId, title: "new-item" });

    expect(item.possiblyRemovable).toBe(false);
  });

  it("updates possiblyRemovable via patch", async () => {
    const repo = new InMemoryWorkItemRepository();
    const item = await repo.create({ workspaceId, title: "new-item" });

    const updated = await repo.update(item.id, { possiblyRemovable: true });

    expect(updated.possiblyRemovable).toBe(true);
  });
});
