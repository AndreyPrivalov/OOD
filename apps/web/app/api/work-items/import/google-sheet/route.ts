import { z } from "zod";
import { NextResponse } from "next/server";
import { jsonError } from "../../../../../lib/http";
import { getRepository } from "../../../../../lib/repository";
import { importWorkItemsFromGoogleSheet } from "../../../../../lib/google-sheet-import";

const ImportGoogleSheetSchema = z
  .object({
    sheetUrl: z.string().url().optional(),
    sheetId: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
    mode: z.enum(["replace", "merge"]).optional(),
    dryRun: z.boolean().optional()
  })
  .refine((value) => Boolean(value.sheetUrl || value.sheetId), {
    message: "Either sheetUrl or sheetId is required",
    path: ["sheetUrl"]
  });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ImportGoogleSheetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_PAYLOAD", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const repository = getRepository();
    const result = await importWorkItemsFromGoogleSheet(parsed.data, { repository });
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
