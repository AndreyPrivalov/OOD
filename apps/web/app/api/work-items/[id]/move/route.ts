import { MoveWorkItemInputSchema, validateMoveWorkItemInput } from "@ood/domain"
import { NextResponse } from "next/server"
import { jsonError } from "../../../../../lib/http"
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
      return NextResponse.json(
        { error: "INVALID_PAYLOAD", details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const move = validateMoveWorkItemInput(parsed.data)
    const repository = getRepository()
    await repository.move(id, move)
    return NextResponse.json({ data: { id, ...move } })
  } catch (error) {
    return jsonError(error)
  }
}
