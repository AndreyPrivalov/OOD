import { z } from "zod"
import {
  jsonData,
  jsonError,
  jsonErrorCode,
  jsonInvalidPayload,
} from "../../../../../../../lib/http"
import { getWorkspaceMetricRepository } from "../../../../../../../lib/workspace-metric-repository"
import { getWorkspaceRepository } from "../../../../../../../lib/workspace-repository"
import { serializeWorkspaceSettings } from "../../../../settings-contracts"

const WorkspaceMetricValueSchema = z.enum(["none", "indirect", "direct"])

const RestoreMetricSnapshotSchema = z.object({
  metric: z.object({
    id: z.string().min(1),
    shortName: z.string().trim().min(1),
    description: z.string().nullable(),
  }),
  targetIndex: z.number().int().min(0),
  removedValues: z.array(
    z.object({
      workItemId: z.string().min(1),
      value: WorkspaceMetricValueSchema,
    }),
  ),
})

const RestoreWorkspaceMetricSchema = z.object({
  snapshot: RestoreMetricSnapshotSchema,
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const parsed = RestoreWorkspaceMetricSchema.safeParse(body)
    if (!parsed.success) {
      return jsonInvalidPayload(parsed.error.flatten())
    }

    const workspaceRepository = getWorkspaceRepository()
    const metricRepository = getWorkspaceMetricRepository()

    const workspace = await workspaceRepository.getById(id)
    if (!workspace) {
      return jsonErrorCode("WORKSPACE_NOT_FOUND", 404)
    }

    const restored = await metricRepository.restoreDeletedMetric(id, {
      snapshot: {
        metric: {
          id: parsed.data.snapshot.metric.id,
          workspaceId: id,
          shortName: parsed.data.snapshot.metric.shortName,
          description: parsed.data.snapshot.metric.description,
        },
        targetIndex: parsed.data.snapshot.targetIndex,
        removedValues: parsed.data.snapshot.removedValues.map((entry) => ({
          workItemId: entry.workItemId,
          value: entry.value,
        })),
      },
    })
    if (!restored) {
      return jsonErrorCode("WORKSPACE_METRIC_CONFLICT", 409)
    }

    const metrics = await metricRepository.listMetrics(id)
    return jsonData(serializeWorkspaceSettings(workspace, metrics))
  } catch (error) {
    return jsonError(error)
  }
}
