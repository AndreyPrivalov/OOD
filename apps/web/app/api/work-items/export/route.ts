import type { WorkTreeReadNode } from "@ood/domain"
import { NextResponse } from "next/server"
import { jsonData, jsonError, jsonErrorCode } from "../../../../lib/http"
import { getRepository } from "../../../../lib/repository"
import { serializeWorkTree } from "../contracts"
import { readWorkspaceId } from "../request"

type ExportRow = {
  id: string
  title: string
  path: string
  parentTitle: string
  siblingOrder: number
}

function escapeCsv(value: string | number): string {
  const text = String(value)
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function flattenTree(
  nodes: WorkTreeReadNode[],
  parentPath: string[] = [],
): ExportRow[] {
  const rows: ExportRow[] = []
  for (const node of nodes) {
    const pathParts = [...parentPath, node.title]
    rows.push({
      id: node.id,
      title: node.title,
      path: pathParts.join("/"),
      parentTitle: node.parentId
        ? (parentPath[parentPath.length - 1] ?? "")
        : "",
      siblingOrder: node.siblingOrder,
    })
    rows.push(...flattenTree(node.children, pathParts))
  }
  return rows
}

function toCsv(rows: ExportRow[]): string {
  const header = ["id", "title", "path", "parentTitle", "siblingOrder"]
  const body = rows.map((row) =>
    [row.id, row.title, row.path, row.parentTitle, row.siblingOrder]
      .map(escapeCsv)
      .join(","),
  )
  return [header.join(","), ...body].join("\n")
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const workspaceId = readWorkspaceId(request)
    const format = url.searchParams.get("format") ?? "json"

    if (format !== "json" && format !== "csv") {
      return jsonErrorCode("INVALID_FORMAT", 400, {
        message: "format must be json or csv",
      })
    }

    const repository = getRepository()
    const tree = await repository.listTree(workspaceId)
    const rows = flattenTree(tree)

    if (format === "csv") {
      const csv = toCsv(rows)
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=work-items-${workspaceId}.csv`,
        },
      })
    }

    return jsonData({
      workspaceId,
      rows,
      tree: serializeWorkTree(tree),
    })
  } catch (error) {
    return jsonError(error)
  }
}
