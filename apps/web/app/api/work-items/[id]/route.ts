import {
  UpdateWorkItemInputSchema,
  type WorkItemMetricValues,
  validateUpdateWorkItemInput,
} from "@ood/domain"
import { jsonData, jsonError, jsonInvalidPayload } from "../../../../lib/http"
import { getRepository } from "../../../../lib/repository"
import { getWorkspaceMetricRepository } from "../../../../lib/workspace-metric-repository"
import { serializeWorkItem } from "../contracts"

function sanitizeMetricValues(values: WorkItemMetricValues | undefined) {
  if (!values) {
    return {}
  }
  const next: WorkItemMetricValues = {}
  for (const [metricId, value] of Object.entries(values)) {
    if (value === "none" || value === "indirect" || value === "direct") {
      next[metricId] = value
    }
  }
  return next
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const parsed = UpdateWorkItemInputSchema.safeParse(body)
    if (!parsed.success) {
      return jsonInvalidPayload(parsed.error.flatten())
    }
    const patch = validateUpdateWorkItemInput(parsed.data)
    const repository = getRepository()
    const updated = await repository.update(id, patch)

    const metricRepository = getWorkspaceMetricRepository()
    const metricEntries = await metricRepository.listWorkItemMetricValues(id)
    const metricValues = sanitizeMetricValues(
      Object.fromEntries(
        metricEntries.map((entry) => [entry.metricId, entry.value]),
      ),
    )
    return jsonData(serializeWorkItem(updated, metricValues, metricValues))
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const repository = getRepository()
    await repository.deleteCascade(id)
    return jsonData({ id, mode: "cascade" as const })
  } catch (error) {
    return jsonError(error)
  }
}
