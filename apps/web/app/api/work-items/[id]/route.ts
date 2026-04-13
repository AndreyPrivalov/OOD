import {
  UpdateWorkItemInputSchema,
  validateUpdateWorkItemInput,
} from "@ood/domain"
import { jsonData, jsonError, jsonInvalidPayload } from "../../../../lib/http"
import { getRepository } from "../../../../lib/repository"
import { serializeWorkItem } from "../contracts"

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
    return jsonData(serializeWorkItem(updated))
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
