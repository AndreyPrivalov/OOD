import { describe, expect, it } from "vitest"
import type { EditState } from "../../work-item-editing"
import { buildRowUiRenderSignature } from "./row-ui-signature"

const baseEdit: EditState = {
  title: "Работа",
  object: "Объект",
  overcomplication: "3",
  importance: "2",
  metricValues: {},
  currentProblems: "Проблема",
  solutionVariants: "Решение",
  possiblyRemovable: false,
}

describe("buildRowUiRenderSignature", () => {
  it("changes when a new workspace metric is added", () => {
    const before = buildRowUiRenderSignature(baseEdit, [])
    const after = buildRowUiRenderSignature(baseEdit, [
      {
        id: "metric-impact",
        shortName: "Impact",
        description: null,
      },
    ])

    expect(after).not.toBe(before)
  })

  it("changes when a metric short name changes", () => {
    const before = buildRowUiRenderSignature(baseEdit, [
      {
        id: "metric-impact",
        shortName: "Impact",
        description: null,
      },
    ])
    const after = buildRowUiRenderSignature(baseEdit, [
      {
        id: "metric-impact",
        shortName: "Value",
        description: null,
      },
    ])

    expect(after).not.toBe(before)
  })
})
