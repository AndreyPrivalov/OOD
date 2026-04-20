import { describe, expect, it } from "vitest"
import {
  createMetricDrafts,
  mapSettingsErrorMessage,
  parseWorkspaceSettings,
} from "./workspace-settings"

describe("workspace settings helpers", () => {
  it("parses canonical workspace settings payload", () => {
    const parsed = parseWorkspaceSettings({
      data: {
        workspace: { id: "ws-1", name: "Core" },
        metrics: [
          { id: "m-1", shortName: "Impact", description: "Revenue" },
          { id: "m-2", shortName: "Risk", description: null },
        ],
      },
    })

    expect(parsed).toEqual({
      workspace: { id: "ws-1", name: "Core" },
      metrics: [
        { id: "m-1", shortName: "Impact", description: "Revenue" },
        { id: "m-2", shortName: "Risk", description: null },
      ],
    })
  })

  it("returns null when payload is not canonical", () => {
    const parsed = parseWorkspaceSettings({
      data: {
        workspace: { id: "", name: "   " },
        metrics: [{ id: "m-1", shortName: "Impact", description: null }],
      },
    })

    expect(parsed).toBeNull()
  })

  it("maps known error codes to user-facing text", () => {
    expect(
      mapSettingsErrorMessage(
        { error: "WORKSPACE_METRIC_NOT_FOUND" },
        "fallback text",
      ),
    ).toBe("Метрика не найдена.")
    expect(mapSettingsErrorMessage({ error: "UNKNOWN" }, "fallback text")).toBe(
      "fallback text",
    )
  })

  it("creates editable drafts from server metrics", () => {
    const drafts = createMetricDrafts([
      { id: "m-1", shortName: "Impact", description: "Revenue" },
      { id: "m-2", shortName: "Risk", description: null },
    ])

    expect(drafts).toEqual({
      "m-1": { shortName: "Impact", description: "Revenue" },
      "m-2": { shortName: "Risk", description: "" },
    })
  })
})
