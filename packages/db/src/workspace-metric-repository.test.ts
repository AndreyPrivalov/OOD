import { DomainErrorCode } from "@ood/domain"
import { describe, expect, it } from "vitest"
import {
  InMemoryWorkItemRepository,
  InMemoryWorkspaceMetricRepository,
  InMemoryWorkspaceRepository,
  __resetInMemoryStoreForTests,
} from "./testing"

describe("InMemoryWorkspaceMetricRepository", () => {
  it("supports empty metric catalog for workspace", async () => {
    __resetInMemoryStoreForTests()
    const workspaceRepo = new InMemoryWorkspaceRepository()
    const metricRepo = new InMemoryWorkspaceMetricRepository()
    const workspace = await workspaceRepo.create({ name: "Alpha" })

    const metrics = await metricRepo.listMetrics(workspace.id)

    expect(metrics).toEqual([])
  })

  it("creates, updates and deletes workspace metric", async () => {
    __resetInMemoryStoreForTests()
    const workspaceRepo = new InMemoryWorkspaceRepository()
    const metricRepo = new InMemoryWorkspaceMetricRepository()
    const workspace = await workspaceRepo.create({ name: "Alpha" })

    const created = await metricRepo.createMetric({
      workspaceId: workspace.id,
      shortName: "  ROI  ",
      description: "  return  ",
    })
    const updated = await metricRepo.updateMetric(workspace.id, created.id, {
      shortName: " Impact ",
      description: " direct impact ",
    })
    const deleted = await metricRepo.deleteMetric(workspace.id, created.id)
    const metrics = await metricRepo.listMetrics(workspace.id)

    expect(created).toMatchObject({
      shortName: "ROI",
      description: "return",
    })
    expect(updated).toMatchObject({
      id: created.id,
      shortName: "Impact",
      description: "direct impact",
    })
    expect(deleted?.metric.id).toBe(created.id)
    expect(metrics).toEqual([])
  })

  it("keeps metric mutations scoped to the requested workspace", async () => {
    __resetInMemoryStoreForTests()
    const workspaceRepo = new InMemoryWorkspaceRepository()
    const metricRepo = new InMemoryWorkspaceMetricRepository()
    const firstWorkspace = await workspaceRepo.create({ name: "Alpha" })
    const secondWorkspace = await workspaceRepo.create({ name: "Beta" })

    const created = await metricRepo.createMetric({
      workspaceId: firstWorkspace.id,
      shortName: "Impact",
    })

    const updatedFromWrongWorkspace = await metricRepo.updateMetric(
      secondWorkspace.id,
      created.id,
      {
        shortName: "Wrong",
      },
    )
    const deletedFromWrongWorkspace = await metricRepo.deleteMetric(
      secondWorkspace.id,
      created.id,
    )

    expect(updatedFromWrongWorkspace).toBeNull()
    expect(deletedFromWrongWorkspace).toBeNull()
    expect(await metricRepo.listMetrics(firstWorkspace.id)).toEqual([
      expect.objectContaining({ id: created.id, shortName: "Impact" }),
    ])
    expect(await metricRepo.listMetrics(secondWorkspace.id)).toEqual([])
  })

  it("deleting metric definition removes all metric values for that metric", async () => {
    __resetInMemoryStoreForTests()
    const workspaceRepo = new InMemoryWorkspaceRepository()
    const itemRepo = new InMemoryWorkItemRepository()
    const metricRepo = new InMemoryWorkspaceMetricRepository()
    const workspace = await workspaceRepo.create({ name: "Alpha" })
    const item = await itemRepo.create({
      workspaceId: workspace.id,
      title: "A",
    })
    const metric = await metricRepo.createMetric({
      workspaceId: workspace.id,
      shortName: "Risk",
    })

    await metricRepo.setWorkItemMetricValue({
      workItemId: item.id,
      metricId: metric.id,
      value: "direct",
    })
    const beforeDelete = await metricRepo.listWorkItemMetricValues(item.id)

    const deleted = await metricRepo.deleteMetric(workspace.id, metric.id)
    const afterDelete = await metricRepo.listWorkItemMetricValues(item.id)

    expect(beforeDelete).toEqual([
      {
        workItemId: item.id,
        metricId: metric.id,
        value: "direct",
      },
    ])
    expect(afterDelete).toEqual([])
    expect(deleted?.removedValues).toEqual([
      {
        workItemId: item.id,
        value: "direct",
      },
    ])
  })

  it("restores deleted metric definition and values from snapshot", async () => {
    __resetInMemoryStoreForTests()
    const workspaceRepo = new InMemoryWorkspaceRepository()
    const itemRepo = new InMemoryWorkItemRepository()
    const metricRepo = new InMemoryWorkspaceMetricRepository()
    const workspace = await workspaceRepo.create({ name: "Alpha" })
    const item = await itemRepo.create({
      workspaceId: workspace.id,
      title: "A",
    })
    const metric = await metricRepo.createMetric({
      workspaceId: workspace.id,
      shortName: "Risk",
    })

    await metricRepo.setWorkItemMetricValue({
      workItemId: item.id,
      metricId: metric.id,
      value: "indirect",
    })
    const deleted = await metricRepo.deleteMetric(workspace.id, metric.id)
    expect(deleted).not.toBeNull()
    if (!deleted) {
      return
    }

    const restored = await metricRepo.restoreDeletedMetric(workspace.id, {
      snapshot: deleted,
    })
    const metrics = await metricRepo.listMetrics(workspace.id)
    const values = await metricRepo.listWorkItemMetricValues(item.id)

    expect(restored?.id).toBe(metric.id)
    expect(metrics.map((entry) => entry.id)).toContain(metric.id)
    expect(values).toEqual([
      {
        workItemId: item.id,
        metricId: metric.id,
        value: "indirect",
      },
    ])
  })

  it("lists metric values for multiple work items in one batch", async () => {
    __resetInMemoryStoreForTests()
    const workspaceRepo = new InMemoryWorkspaceRepository()
    const itemRepo = new InMemoryWorkItemRepository()
    const metricRepo = new InMemoryWorkspaceMetricRepository()
    const workspace = await workspaceRepo.create({ name: "Alpha" })
    const firstItem = await itemRepo.create({
      workspaceId: workspace.id,
      title: "A",
    })
    const secondItem = await itemRepo.create({
      workspaceId: workspace.id,
      title: "B",
    })
    const firstMetric = await metricRepo.createMetric({
      workspaceId: workspace.id,
      shortName: "Risk",
    })
    const secondMetric = await metricRepo.createMetric({
      workspaceId: workspace.id,
      shortName: "Impact",
    })

    await metricRepo.setWorkItemMetricValue({
      workItemId: firstItem.id,
      metricId: secondMetric.id,
      value: "indirect",
    })
    await metricRepo.setWorkItemMetricValue({
      workItemId: firstItem.id,
      metricId: firstMetric.id,
      value: "direct",
    })
    await metricRepo.setWorkItemMetricValue({
      workItemId: secondItem.id,
      metricId: firstMetric.id,
      value: "indirect",
    })

    const values = await metricRepo.listWorkItemMetricValuesBatch([
      secondItem.id,
      firstItem.id,
    ])

    const expected = [
      {
        workItemId: firstItem.id,
        metricId: firstMetric.id,
        value: "direct",
      },
      {
        workItemId: firstItem.id,
        metricId: secondMetric.id,
        value: "indirect",
      },
      {
        workItemId: secondItem.id,
        metricId: firstMetric.id,
        value: "indirect",
      },
    ].sort(
      (left, right) =>
        left.workItemId.localeCompare(right.workItemId) ||
        left.metricId.localeCompare(right.metricId),
    )

    expect(values).toEqual(expected)
  })

  it("rejects setting metric value when metric belongs to another workspace", async () => {
    __resetInMemoryStoreForTests()
    const workspaceRepo = new InMemoryWorkspaceRepository()
    const itemRepo = new InMemoryWorkItemRepository()
    const metricRepo = new InMemoryWorkspaceMetricRepository()
    const firstWorkspace = await workspaceRepo.create({ name: "Alpha" })
    const secondWorkspace = await workspaceRepo.create({ name: "Beta" })
    const item = await itemRepo.create({
      workspaceId: firstWorkspace.id,
      title: "A",
    })
    const foreignMetric = await metricRepo.createMetric({
      workspaceId: secondWorkspace.id,
      shortName: "Risk",
    })

    await expect(
      metricRepo.setWorkItemMetricValue({
        workItemId: item.id,
        metricId: foreignMetric.id,
        value: "direct",
      }),
    ).rejects.toMatchObject({
      code: DomainErrorCode.INVALID_MOVE_TARGET,
    })
  })
})
