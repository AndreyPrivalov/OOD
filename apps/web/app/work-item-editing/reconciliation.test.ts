import { describe, expect, it } from "vitest"
import {
  buildRowPatchFromPayload,
  buildRowPatchFromServer,
  isServerPatchEchoingPayload,
} from "./reconciliation"

describe("buildRowPatchFromServer", () => {
  it("keeps only supported server fields and sanitizes string lists", () => {
    const patch = buildRowPatchFromServer({
      id: "server-row-1",
      title: "Next title",
      object: null,
      possiblyRemovable: true,
      overcomplication: 4,
      blocksMoney: null,
      currentProblems: ["a", 1, "b"] as unknown as string[],
      solutionVariants: ["x", false, "y"] as unknown as string[],
    })

    expect(patch).toEqual({
      id: "server-row-1",
      title: "Next title",
      object: null,
      possiblyRemovable: true,
      overcomplication: 4,
      blocksMoney: null,
      currentProblems: ["a", "b"],
      solutionVariants: ["x", "y"],
    })
  })
})

describe("buildRowPatchFromPayload", () => {
  it("keeps only supported payload fields and sanitizes string lists", () => {
    const patch = buildRowPatchFromPayload({
      title: "Updated",
      object: null,
      possiblyRemovable: false,
      overcomplication: 5,
      importance: null,
      currentProblems: ["x", 1, "y"],
      solutionVariants: ["s1", { bad: true }, "s2"],
      ignored: "value",
    })

    expect(patch).toEqual({
      title: "Updated",
      object: null,
      possiblyRemovable: false,
      overcomplication: 5,
      importance: null,
      currentProblems: ["x", "y"],
      solutionVariants: ["s1", "s2"],
    })
  })
})

describe("isServerPatchEchoingPayload", () => {
  it("detects echoed primitive and list values", () => {
    const patch = {
      title: "Hello",
      currentProblems: ["a", "b"],
    }
    const payload = {
      title: "Hello",
      currentProblems: ["a", "b"],
    }
    expect(isServerPatchEchoingPayload(patch, payload)).toBe(true)
  })

  it("returns false for empty patches and mismatched values", () => {
    expect(isServerPatchEchoingPayload({}, { title: "x" })).toBe(false)
    expect(
      isServerPatchEchoingPayload(
        { solutionVariants: ["a", "b"] },
        { solutionVariants: ["a"] },
      ),
    ).toBe(false)
  })
})
