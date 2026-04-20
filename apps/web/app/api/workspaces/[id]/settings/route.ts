import { z } from "zod"
import {
  jsonData,
  jsonError,
  jsonErrorCode,
  jsonInvalidPayload,
} from "../../../../../lib/http"
import { getWorkspaceMetricRepository } from "../../../../../lib/workspace-metric-repository"
import { getWorkspaceRepository } from "../../../../../lib/workspace-repository"
import { serializeWorkspaceSettings } from "../../settings-contracts"

const RenameWorkspaceSchema = z.object({
  name: z.string().trim().min(1),
})

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const workspaceRepository = getWorkspaceRepository()
    const metricRepository = getWorkspaceMetricRepository()

    const workspace = await workspaceRepository.getById(id)
    if (!workspace) {
      return jsonErrorCode("WORKSPACE_NOT_FOUND", 404)
    }

    const metrics = await metricRepository.listMetrics(id)
    return jsonData(serializeWorkspaceSettings(workspace, metrics))
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const parsed = RenameWorkspaceSchema.safeParse(body)

    if (!parsed.success) {
      return jsonInvalidPayload(parsed.error.flatten())
    }

    const workspaceRepository = getWorkspaceRepository()
    const metricRepository = getWorkspaceMetricRepository()

    const renamed = await workspaceRepository.rename(id, parsed.data)
    if (!renamed) {
      return jsonErrorCode("WORKSPACE_NOT_FOUND", 404)
    }

    const metrics = await metricRepository.listMetrics(id)
    return jsonData(serializeWorkspaceSettings(renamed, metrics))
  } catch (error) {
    return jsonError(error)
  }
}
