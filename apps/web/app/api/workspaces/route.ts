import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonError } from "../../../lib/http"
import { getWorkspaceRepository } from "../../../lib/workspace-repository"

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1),
})

export async function GET() {
  try {
    const repository = getWorkspaceRepository()
    const workspaces = await repository.list()
    return NextResponse.json({ data: workspaces })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = CreateWorkspaceSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_PAYLOAD", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const repository = getWorkspaceRepository()
    const created = await repository.create(parsed.data)
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
