import {
  CreateWorkItemInputSchema,
  validateCreateWorkItemInput,
} from "@ood/domain"
import { jsonData, jsonError, jsonInvalidPayload } from "../../../lib/http"
import { getRepository } from "../../../lib/repository"
import { serializeWorkItem, serializeWorkTree } from "./contracts"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const workspaceId =
      url.searchParams.get("workspaceId") ?? "default-workspace"
    const repository = getRepository()
    const tree = await repository.listTree(workspaceId)
    return jsonData(serializeWorkTree(tree))
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
