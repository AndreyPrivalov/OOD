"use client"

export type WorkItemErrorPayload = {
  error?: string
  message?: string
}

type ApiEnvelope<T> = {
  data: T
  error?: string
  message?: string
}

export class WorkItemRequestError extends Error {
  payload: WorkItemErrorPayload | null

  constructor(payload: WorkItemErrorPayload | null) {
    super(payload?.message ?? payload?.error ?? "Work item request failed")
    this.name = "WorkItemRequestError"
    this.payload = payload
  }
}

async function requestData<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init)
  const json = (await response.json()) as ApiEnvelope<T> | null

  if (!response.ok) {
    throw new WorkItemRequestError(json)
  }

  return (json?.data ?? null) as T
}

export function fetchWorkItems(workspaceId: string) {
  return requestData<unknown[]>(
    `/api/work-items?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: "no-store" },
  )
}

export function createWorkItem(input: {
  workspaceId: string
  title: string
  object: string | null
  parentId: string | null
  siblingOrder: number
}) {
  return requestData<unknown>("/api/work-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function patchWorkItem(id: string, payload: Record<string, unknown>) {
  return requestData<unknown>(`/api/work-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export function deleteWorkItem(id: string) {
  return requestData<unknown>(`/api/work-items/${id}`, {
    method: "DELETE",
  })
}

export function moveWorkItem(
  id: string,
  input: { targetParentId: string | null; targetIndex: number },
) {
  return requestData<unknown>(`/api/work-items/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}
