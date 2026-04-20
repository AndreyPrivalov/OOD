"use client"

import type { WorkspaceMetricSummary } from "./workspaces/types"

type ApiEnvelope<T> = {
  data?: T
  error?: string
  message?: string
  details?: unknown
}

type WorkspaceMetricValue = "none" | "indirect" | "direct"

type DeletedMetricValueSnapshot = {
  workItemId: string
  value: WorkspaceMetricValue
}

export type DeletedWorkspaceMetricSnapshot = {
  metric: WorkspaceMetricSummary
  targetIndex: number
  removedValues: DeletedMetricValueSnapshot[]
}

type WorkspaceMetricsResponse = {
  workspace: {
    id: string
    name: string
    createdAt: string
    updatedAt: string
  }
  metrics: WorkspaceMetricSummary[]
  deletedMetricSnapshot?: DeletedWorkspaceMetricSnapshot
}

export type UpsertWorkspaceMetricInput = {
  shortName: string
  description: string | null
}

export class WorkspaceMetricRequestError extends Error {
  payload: ApiEnvelope<unknown> | null

  constructor(payload: ApiEnvelope<unknown> | null) {
    super(
      payload?.message ?? payload?.error ?? "Workspace metric request failed",
    )
    this.name = "WorkspaceMetricRequestError"
    this.payload = payload
  }
}

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
    throw new WorkspaceMetricRequestError(
      envelope as ApiEnvelope<unknown> | null,
    )
  }

  return (envelope?.data ?? null) as T
}

export async function createWorkspaceMetric(
  workspaceId: string,
  input: UpsertWorkspaceMetricInput,
): Promise<WorkspaceMetricSummary[]> {
  const data = await requestData<WorkspaceMetricsResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/settings/metrics`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
  return Array.isArray(data.metrics) ? data.metrics : []
}

export async function updateWorkspaceMetric(
  workspaceId: string,
  metricId: string,
  input: UpsertWorkspaceMetricInput,
): Promise<WorkspaceMetricSummary[]> {
  const data = await requestData<WorkspaceMetricsResponse>(
    `/api/workspaces/${encodeURIComponent(
      workspaceId,
    )}/settings/metrics/${encodeURIComponent(metricId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
  return Array.isArray(data.metrics) ? data.metrics : []
}

export async function deleteWorkspaceMetric(
  workspaceId: string,
  metricId: string,
): Promise<{
  metrics: WorkspaceMetricSummary[]
  deletedMetricSnapshot: DeletedWorkspaceMetricSnapshot | null
}> {
  const data = await requestData<WorkspaceMetricsResponse>(
    `/api/workspaces/${encodeURIComponent(
      workspaceId,
    )}/settings/metrics/${encodeURIComponent(metricId)}`,
    { method: "DELETE" },
  )

  return {
    metrics: Array.isArray(data.metrics) ? data.metrics : [],
    deletedMetricSnapshot: data.deletedMetricSnapshot ?? null,
  }
}

export async function restoreWorkspaceMetric(
  workspaceId: string,
  snapshot: DeletedWorkspaceMetricSnapshot,
): Promise<WorkspaceMetricSummary[]> {
  const data = await requestData<WorkspaceMetricsResponse>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/settings/metrics/restore`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot }),
    },
  )
  return Array.isArray(data.metrics) ? data.metrics : []
}
