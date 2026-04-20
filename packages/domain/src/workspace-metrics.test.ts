import { describe, expect, it } from "vitest"
import { DomainError, DomainErrorCode } from "./errors"
import {
  validateCanonicalCreateWorkItemInput,
  validateUpsertWorkspaceMetricInput,
} from "./validation"

describe("workspace metrics invariants", () => {
  it("trims shortName and description", () => {
    const normalized = validateUpsertWorkspaceMetricInput({
      shortName: "  ROI  ",
      description: "  return on impact  ",
    })

    expect(normalized).toEqual({
      shortName: "ROI",
      description: "return on impact",
    })
  })

  it("rejects empty shortName after trim", () => {
    try {
      validateUpsertWorkspaceMetricInput({
        shortName: "   ",
        description: "kept",
      })
      throw new Error("Expected validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(
        DomainErrorCode.EMPTY_WORKSPACE_METRIC_SHORT_NAME,
      )
    }
  })

  it("allows duplicate shortName and description", () => {
    const first = validateUpsertWorkspaceMetricInput({
      shortName: "Flow",
      description: "Blocked by dependencies",
    })
    const second = validateUpsertWorkspaceMetricInput({
      shortName: "Flow",
      description: "Blocked by dependencies",
    })

    expect(first).toEqual(second)
  })

  it("accepts only canonical enum values for metricValues", () => {
    const parsed = validateCanonicalCreateWorkItemInput({
      workspaceId: "default-workspace",
      title: "new-item",
      metricValues: {
        metricA: "none",
        metricB: "indirect",
        metricC: "direct",
      },
    })

    expect(parsed.metricValues?.metricB).toBe("indirect")
  })

  it("rejects non-canonical metric value", () => {
    try {
      validateCanonicalCreateWorkItemInput({
        workspaceId: "default-workspace",
        title: "new-item",
        metricValues: {
          metricA: "unexpected" as never,
        },
      })
      throw new Error("Expected validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(
        DomainErrorCode.INVALID_NUMERIC_RANGE,
      )
    }
  })
})
