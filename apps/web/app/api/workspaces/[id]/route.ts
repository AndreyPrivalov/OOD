import { jsonData, jsonError, jsonErrorCode } from "../../../../lib/http"
import { getWorkspaceRepository } from "../../../../lib/workspace-repository"

const DEFAULT_WORKSPACE_ID = "default-workspace"

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
