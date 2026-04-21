import { describe, expect, it } from "vitest"
import {
  readActiveWorkspaceId,
  readWorkspaceViewMode,
  writeActiveWorkspaceId,
  writeWorkspaceViewMode,
} from "./workspace-session-state"

function makeStorage() {
  const storage = new Map<string, string>()
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
    has: (key: string) => storage.has(key),
  }
}

describe("workspace-session-state", () => {
  it("stores the active workspace in sessionStorage", () => {
    const sessionStorage = makeStorage()
    Object.assign(globalThis, { window: { sessionStorage } })

    writeActiveWorkspaceId("ws-1")
    expect(readActiveWorkspaceId()).toBe("ws-1")

    writeActiveWorkspaceId(null)
    expect(readActiveWorkspaceId()).toBeNull()
  })

  it("stores view mode per workspace and rejects invalid values", () => {
    const sessionStorage = makeStorage()
    Object.assign(globalThis, { window: { sessionStorage } })

    writeWorkspaceViewMode("ws-1", "split")
    writeWorkspaceViewMode("ws-2", "table-only")

    expect(readWorkspaceViewMode("ws-1")).toBe("split")
    expect(readWorkspaceViewMode("ws-2")).toBe("table-only")

    sessionStorage.setItem("ood:workspace-ui:v1:view-mode:ws-3", "invalid")
    expect(readWorkspaceViewMode("ws-3")).toBeNull()
  })
})
