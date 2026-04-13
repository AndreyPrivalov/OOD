import { MoveWorkItemInputSchema, validateMoveWorkItemInput } from "@ood/domain"
import {
  jsonData,
  jsonError,
  jsonInvalidPayload,
} from "../../../../../lib/http"
import { getRepository } from "../../../../../lib/repository"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const parsed = MoveWorkItemInputSchema.safeParse(body)
    if (!parsed.success) {
      return jsonInvalidPayload(parsed.error.flatten())
    }
    const move = validateMoveWorkItemInput(parsed.data)
    const repository = getRepository()
    await repository.move(id, move)
    return jsonData({ id, ...move })
  } catch (error) {
    return jsonError(error)
  }
}
