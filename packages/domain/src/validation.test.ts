import { describe, expect, it } from "vitest"
import { DomainError, DomainErrorCode } from "./errors"
import {
  validateCreateWorkItemInput,
  validateUpdateWorkItemInput,
} from "./validation"

describe("validation", () => {
  it("accepts ratings in 0..5 range", () => {
    const parsed = validateCreateWorkItemInput({
      workspaceId: "default-workspace",
      title: "new-item",
      possiblyRemovable: true,
      overcomplication: 5,
      importance: 0,
    })
    expect(parsed.workspaceId).toBe("default-workspace")
    expect(parsed.possiblyRemovable).toBe(true)
  })

  it("rejects out of range rating", () => {
    try {
      validateUpdateWorkItemInput({ importance: 8 as never })
      throw new Error("Expected validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(
        DomainErrorCode.INVALID_NUMERIC_RANGE,
      )
    }
  })

  it("rejects empty title update", () => {
    try {
      validateUpdateWorkItemInput({ title: " " })
      throw new Error("Expected validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(DomainErrorCode.EMPTY_TITLE)
    }
  })

  it("rejects empty title create", () => {
    try {
      validateCreateWorkItemInput({
        workspaceId: "default-workspace",
        title: "",
      })
      throw new Error("Expected validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(DomainErrorCode.EMPTY_TITLE)
    }
  })

  it("rejects blank title create", () => {
    try {
      validateCreateWorkItemInput({
        workspaceId: "default-workspace",
        title: "   ",
      })
      throw new Error("Expected validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(DomainErrorCode.EMPTY_TITLE)
    }
  })
})
