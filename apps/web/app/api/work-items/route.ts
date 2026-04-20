import {
  CreateWorkItemInputSchema,
  type WorkItemMetricValues,
  validateCreateWorkItemInput,
} from "@ood/domain"
import { jsonData, jsonError, jsonInvalidPayload } from "../../../lib/http"
import { getRepository } from "../../../lib/repository"
import { getWorkspaceMetricRepository } from "../../../lib/workspace-metric-repository"
import { serializeWorkItem, serializeWorkTree } from "./contracts"
import { readWorkspaceId } from "./request"

function collectTreeIds(
  nodes: ReadonlyArray<{ id: string; children: unknown[] }>,
) {
  const ids: string[] = []
  const queue = [...nodes]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) {
      continue
    }
    ids.push(node.id)
    for (const child of node.children) {
      if (
        child &&
        typeof child === "object" &&
        "id" in child &&
        "children" in child
      ) {
        queue.push(child as { id: string; children: unknown[] })
      }
    }
  }
  return ids
}

export async function GET(request: Request) {
  try {
    const workspaceId = readWorkspaceId(request)
    const repository = getRepository()
    const metricRepository = getWorkspaceMetricRepository()
    const tree = await repository.listTree(workspaceId)
    const metrics = await metricRepository.listMetrics(workspaceId)
    const metricIds = metrics.map((metric) => metric.id)

    const nodeIds = collectTreeIds(tree)
    const entriesByItemId = new Map<string, WorkItemMetricValues>()
    await Promise.all(
      nodeIds.map(async (workItemId) => {
        const entries =
          await metricRepository.listWorkItemMetricValues(workItemId)
        entriesByItemId.set(
          workItemId,
          Object.fromEntries(
            entries.map((entry) => [entry.metricId, entry.value]),
          ),
        )
      }),
    )

    return jsonData(
      serializeWorkTree(tree, {
        metricIds,
        metricValuesByItemId: entriesByItemId,
      }),
    )
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = CreateWorkItemInputSchema.safeParse(body)
    if (!parsed.success) {
      return jsonInvalidPayload(parsed.error.flatten())
    }
    const input = validateCreateWorkItemInput(parsed.data)
    const repository = getRepository()
    const created = await repository.create(input)
    return jsonData(serializeWorkItem(created), { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
