import {
  CreateWorkItemInputSchema,
  type WorkTreeReadNode,
  validateCreateWorkItemInput
} from "@ood/domain";
import { NextResponse } from "next/server";
import { jsonError } from "../../../lib/http";
import { getRepository } from "../../../lib/repository";

type LegacyAggregateNode = {
  overcomplicationSum?: unknown;
  importanceSum?: unknown;
  blocksMoneySum?: unknown;
  overcomplication_sum?: unknown;
  importance_sum?: unknown;
  blocks_money_sum?: unknown;
  aggregates?: {
    overcomplicationSum?: unknown;
    importanceSum?: unknown;
    blocksMoneySum?: unknown;
    overcomplication_sum?: unknown;
    importance_sum?: unknown;
    blocks_money_sum?: unknown;
  };
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function pickAggregate(
  node: LegacyAggregateNode,
  camelKey: "overcomplicationSum" | "importanceSum" | "blocksMoneySum",
  snakeKey: "overcomplication_sum" | "importance_sum" | "blocks_money_sum"
): number {
  const candidates = [
    node[camelKey],
    node.aggregates?.[camelKey],
    node[snakeKey],
    node.aggregates?.[snakeKey]
  ];
  for (const candidate of candidates) {
    const parsed = toFiniteNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return 0;
}

function normalizeReadNode(node: WorkTreeReadNode): WorkTreeReadNode {
  const legacyNode = node as WorkTreeReadNode & LegacyAggregateNode;
  return {
    ...node,
    overcomplicationSum: pickAggregate(
      legacyNode,
      "overcomplicationSum",
      "overcomplication_sum"
    ),
    importanceSum: pickAggregate(legacyNode, "importanceSum", "importance_sum"),
    blocksMoneySum: pickAggregate(legacyNode, "blocksMoneySum", "blocks_money_sum"),
    children: node.children.map(normalizeReadNode)
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "default-workspace";
    const repository = getRepository();
    const tree = await repository.listTree(workspaceId);
    return NextResponse.json({ data: tree.map(normalizeReadNode) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateWorkItemInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_PAYLOAD", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const input = validateCreateWorkItemInput(parsed.data);
    const repository = getRepository();
    const created = await repository.create(input);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
