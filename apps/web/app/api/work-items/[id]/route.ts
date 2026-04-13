import {
  UpdateWorkItemInputSchema,
  validateUpdateWorkItemInput
} from "@ood/domain";
import { NextResponse } from "next/server";
import { jsonError } from "../../../../lib/http";
import { getRepository } from "../../../../lib/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = UpdateWorkItemInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_PAYLOAD", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const patch = validateUpdateWorkItemInput(parsed.data);
    const repository = getRepository();
    const updated = await repository.update(id, patch);
    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const repository = getRepository();
    await repository.deleteCascade(id);
    return NextResponse.json({ data: { id, mode: "cascade" as const } });
  } catch (error) {
    return jsonError(error);
  }
}
