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

const UpsertWorkspaceMetricSchema = z.object({
  shortName: z.string().trim().min(1),
  description: z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; metricId: string }> },
) {
  try {
    const { id, metricId } = await context.params
    const body = await request.json()
    const parsed = UpsertWorkspaceMetricSchema.safeParse(body)

    if (!parsed.success) {
      return jsonInvalidPayload(parsed.error.flatten())
    }

    const workspaceRepository = getWorkspaceRepository()
    const metricRepository = getWorkspaceMetricRepository()

    const workspace = await workspaceRepository.getById(id)
    if (!workspace) {
      return jsonErrorCode("WORKSPACE_NOT_FOUND", 404)
    }

    const updated = await metricRepository.updateMetric(id, metricId, {
      shortName: parsed.data.shortName,
      description: parsed.data.description,
    })
    if (!updated) {
      return jsonErrorCode("WORKSPACE_METRIC_NOT_FOUND", 404)
    }

    const metrics = await metricRepository.listMetrics(id)
    return jsonData(serializeWorkspaceSettings(workspace, metrics))
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; metricId: string }> },
) {
  try {
    const { id, metricId } = await context.params
    const workspaceRepository = getWorkspaceRepository()
    const metricRepository = getWorkspaceMetricRepository()

    const workspace = await workspaceRepository.getById(id)
    if (!workspace) {
      return jsonErrorCode("WORKSPACE_NOT_FOUND", 404)
    }

    const deletedSnapshot = await metricRepository.deleteMetric(id, metricId)
    if (!deletedSnapshot) {
      return jsonErrorCode("WORKSPACE_METRIC_NOT_FOUND", 404)
    }

    const metrics = await metricRepository.listMetrics(id)
    return jsonData({
      ...serializeWorkspaceSettings(workspace, metrics),
      deletedMetricSnapshot: {
        metric: {
          id: deletedSnapshot.metric.id,
          shortName: deletedSnapshot.metric.shortName,
          description: deletedSnapshot.metric.description,
        },
        targetIndex: deletedSnapshot.targetIndex,
        removedValues: deletedSnapshot.removedValues.map((entry) => ({
          workItemId: entry.workItemId,
          value: entry.value,
        })),
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
