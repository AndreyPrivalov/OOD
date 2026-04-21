import { describe, expect, it } from "vitest"
import { resolveTitleHotkeyAction } from "./title-hotkeys"

describe("resolveTitleHotkeyAction", () => {
  it("returns creation hotkeys for title field", () => {
    expect(
      resolveTitleHotkeyAction({
        key: "Tab",
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBe("create-child")

    expect(
      resolveTitleHotkeyAction({
        key: "Enter",
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBe("create-sibling")

    expect(
      resolveTitleHotkeyAction({
        key: "Enter",
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBe("blur")

    expect(
      resolveTitleHotkeyAction({
        key: "Escape",
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBe("cancel")
  })

  it("returns null for unsupported combinations", () => {
    expect(
      resolveTitleHotkeyAction({
        key: "Tab",
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBeNull()

    expect(
      resolveTitleHotkeyAction({
        key: "a",
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBeNull()
  })
})
