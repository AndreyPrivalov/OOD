import { z } from "zod"
import {
  jsonData,
  jsonError,
  jsonErrorCode,
  jsonInvalidPayload,
} from "../../../../lib/http"
import { getWorkspaceRepository } from "../../../../lib/workspace-repository"

const DEFAULT_WORKSPACE_ID = "default-workspace"

const RenameWorkspaceSchema = z.object({
  name: z.string().trim().min(1),
})

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

    const repository = getWorkspaceRepository()
    const renamed = await repository.rename(id, parsed.data)
    if (!renamed) {
      return jsonErrorCode("WORKSPACE_NOT_FOUND", 404)
    }

    return jsonData(renamed)
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

    if (id === DEFAULT_WORKSPACE_ID) {
      return jsonErrorCode("DEFAULT_WORKSPACE_PROTECTED", 409)
    }

    const repository = getWorkspaceRepository()
    const deleted = await repository.delete(id)
    if (!deleted) {
      return jsonErrorCode("WORKSPACE_NOT_FOUND", 404)
    }

    return jsonData({ id, mode: "cascade" as const })
  } catch (error) {
    return jsonError(error)
  }
}
