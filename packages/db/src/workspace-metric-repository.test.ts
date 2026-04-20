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
    const updated = await metricRepo.updateMetric(created.id, {
      shortName: " Impact ",
      description: " direct impact ",
    })
    const deleted = await metricRepo.deleteMetric(created.id)
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
    expect(deleted).toBe(true)
    expect(metrics).toEqual([])
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

    await metricRepo.deleteMetric(metric.id)
    const afterDelete = await metricRepo.listWorkItemMetricValues(item.id)

    expect(beforeDelete).toEqual([
      {
        workItemId: item.id,
        metricId: metric.id,
        value: "direct",
      },
    ])
    expect(afterDelete).toEqual([])
  })
})
