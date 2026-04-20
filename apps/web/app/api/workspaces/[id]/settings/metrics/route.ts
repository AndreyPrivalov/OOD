import { z } from "zod"
import {
  jsonData,
  jsonError,
  jsonErrorCode,
  jsonInvalidPayload,
} from "../../../../../../lib/http"
import { getWorkspaceMetricRepository } from "../../../../../../lib/workspace-metric-repository"
import { getWorkspaceRepository } from "../../../../../../lib/workspace-repository"
import { serializeWorkspaceSettings } from "../../../settings-contracts"

const UpsertWorkspaceMetricSchema = z.object({
  shortName: z.string().trim().min(1),
  description: z.string().nullable().optional(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
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

    await metricRepository.createMetric({
      workspaceId: id,
      shortName: parsed.data.shortName,
      description: parsed.data.description,
    })
    const metrics = await metricRepository.listMetrics(id)

    return jsonData(serializeWorkspaceSettings(workspace, metrics), {
      status: 201,
    })
  } catch (error) {
    return jsonError(error)
  }
}
