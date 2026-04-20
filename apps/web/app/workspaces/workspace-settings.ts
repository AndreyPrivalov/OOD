export type WorkspaceMetricSettingsView = {
  id: string
  shortName: string
  description: string | null
}

export type WorkspaceSettingsView = {
  workspace: {
    id: string
    name: string
  }
  metrics: WorkspaceMetricSettingsView[]
}

export type MetricDraft = {
  shortName: string
  description: string
}

export function parseWorkspaceSettings(
  payload: unknown,
): WorkspaceSettingsView | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  if (
    !("data" in payload) ||
    !payload.data ||
    typeof payload.data !== "object"
  ) {
    return null
  }

  const data = payload.data
  if (
    !("workspace" in data) ||
    !data.workspace ||
    typeof data.workspace !== "object"
  ) {
    return null
  }

  const workspace = data.workspace
  const id =
    "id" in workspace && typeof workspace.id === "string"
      ? workspace.id.trim()
      : ""
  const name =
    "name" in workspace && typeof workspace.name === "string"
      ? workspace.name.trim()
      : ""

  if (id.length === 0 || name.length === 0) {
    return null
  }

  const metricsSource =
    "metrics" in data && Array.isArray(data.metrics) ? data.metrics : []
  const metrics = metricsSource
    .map((metric): WorkspaceMetricSettingsView | null => {
      if (!metric || typeof metric !== "object") {
        return null
      }
      const metricId =
        "id" in metric && typeof metric.id === "string" ? metric.id.trim() : ""
      const shortName =
        "shortName" in metric && typeof metric.shortName === "string"
          ? metric.shortName.trim()
          : ""
      const description =
        "description" in metric &&
        (typeof metric.description === "string" || metric.description === null)
          ? metric.description
          : null
      if (metricId.length === 0 || shortName.length === 0) {
        return null
      }
      return { id: metricId, shortName, description }
    })
    .filter(
      (
        metric: WorkspaceMetricSettingsView | null,
      ): metric is WorkspaceMetricSettingsView => metric !== null,
    )

  return {
    workspace: { id, name },
    metrics,
  }
}

export function mapSettingsErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    if (payload.error === "INVALID_PAYLOAD") {
      return "Проверьте заполнение полей в настройках."
    }
    if (payload.error === "WORKSPACE_NOT_FOUND") {
      return "Рабочее пространство не найдено."
    }
    if (payload.error === "WORKSPACE_METRIC_NOT_FOUND") {
      return "Метрика не найдена."
    }
    if (payload.error === "DEFAULT_WORKSPACE_PROTECTED") {
      return "Базовое рабочее пространство нельзя удалить."
    }
  }

  return fallback
}

export function createMetricDrafts(metrics: WorkspaceMetricSettingsView[]) {
  return Object.fromEntries(
    metrics.map((metric) => [
      metric.id,
      {
        shortName: metric.shortName,
        description: metric.description ?? "",
      },
    ]),
  ) as Record<string, MetricDraft>
}
