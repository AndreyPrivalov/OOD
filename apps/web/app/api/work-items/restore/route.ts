import {
  RestoreWorkItemBranchInputSchema,
  validateRestoreWorkItemBranchInput,
} from "@ood/domain"
import { jsonData, jsonError, jsonInvalidPayload } from "../../../../lib/http"
import { getRepository } from "../../../../lib/repository"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = RestoreWorkItemBranchInputSchema.safeParse(body)
    if (!parsed.success) {
      return jsonInvalidPayload(parsed.error.flatten())
    }

    const input = validateRestoreWorkItemBranchInput(parsed.data)
    const repository = getRepository()
    const idMap = await repository.restoreBranch(input)
    return jsonData({ idMap })
  } catch (error) {
    return jsonError(error)
  }
}
