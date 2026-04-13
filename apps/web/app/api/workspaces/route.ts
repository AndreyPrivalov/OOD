import { z } from "zod"
import { jsonData, jsonError, jsonInvalidPayload } from "../../../lib/http"
import { getWorkspaceRepository } from "../../../lib/workspace-repository"

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1),
})

export async function GET() {
  try {
    const repository = getWorkspaceRepository()
    const workspaces = await repository.list()
    return jsonData(workspaces)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = CreateWorkspaceSchema.safeParse(body)

    if (!parsed.success) {
      return jsonInvalidPayload(parsed.error.flatten())
    }

    const repository = getWorkspaceRepository()
    const created = await repository.create(parsed.data)
    return jsonData(created, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
