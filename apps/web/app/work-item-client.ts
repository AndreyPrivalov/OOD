"use client"

import type {
  SerializedWorkItem,
  SerializedWorkTreeNode,
} from "./api/work-items/contracts"

export type WorkItemErrorPayload = {
  error?: string
  message?: string
  details?: unknown
}

type ApiEnvelope<T> = {
  data?: T
  error?: string
  message?: string
  details?: unknown
}

export class WorkItemRequestError extends Error {
  payload: WorkItemErrorPayload | null

  constructor(payload: WorkItemErrorPayload | null) {
    super(payload?.message ?? payload?.error ?? "Work item request failed")
    this.name = "WorkItemRequestError"
    this.payload = payload
  }
}

type MoveWorkItemInput = {
  targetParentId: string | null
  targetIndex: number
}

type MoveWorkItemResponse = {
  id: string
  targetParentId: string | null
  targetIndex: number
}

type DeleteWorkItemResponse = {
  id: string
  mode: "cascade"
}

type PatchWorkItemPayload = Partial<
  Pick<
    SerializedWorkItem,
    | "title"
    | "object"
    | "possiblyRemovable"
    | "overcomplication"
    | "importance"
    | "blocksMoney"
    | "currentProblems"
    | "solutionVariants"
  >
>

async function parseEnvelope<T>(
  response: Response,
): Promise<ApiEnvelope<T> | null> {
  try {
    const json = await response.json()
    if (json && typeof json === "object") {
      return json as ApiEnvelope<T>
    }
    return null
  } catch {
    return null
  }
}

async function requestData<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init)
  const envelope = await parseEnvelope<T>(response)

  if (!response.ok) {
    throw new WorkItemRequestError(envelope)
  }

  return (envelope?.data ?? null) as T
}

export function fetchWorkItems(
  workspaceId: string,
): Promise<SerializedWorkTreeNode[]> {
  return requestData<SerializedWorkTreeNode[]>(
    `/api/work-items?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: "no-store" },
  )
}

export function createWorkItem(input: {
  workspaceId: SerializedWorkItem["workspaceId"]
  title: SerializedWorkItem["title"]
  object: SerializedWorkItem["object"]
  parentId: SerializedWorkItem["parentId"]
  siblingOrder: SerializedWorkItem["siblingOrder"]
  possiblyRemovable?: SerializedWorkItem["possiblyRemovable"]
}): Promise<SerializedWorkItem> {
  return requestData<SerializedWorkItem>("/api/work-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function patchWorkItem(
  id: SerializedWorkItem["id"],
  payload: PatchWorkItemPayload,
): Promise<SerializedWorkItem> {
  return requestData<SerializedWorkItem>(`/api/work-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export function deleteWorkItem(
  id: SerializedWorkItem["id"],
): Promise<DeleteWorkItemResponse> {
  return requestData<DeleteWorkItemResponse>(`/api/work-items/${id}`, {
    method: "DELETE",
  })
}

export function moveWorkItem(
  id: SerializedWorkItem["id"],
  input: MoveWorkItemInput,
): Promise<MoveWorkItemResponse> {
  return requestData<MoveWorkItemResponse>(`/api/work-items/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}
