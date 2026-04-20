import type { ReactNode } from "react"
import { isValidElement } from "react"
import { describe, expect, it } from "vitest"
import { WorkspaceControlPanel } from "./workspace-control-panel"
import { WorkspaceTitlePanel } from "./workspace-title-panel"

function collectText(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)]
  }
  if (Array.isArray(node)) {
    return node.flatMap((entry) => collectText(entry))
  }
  if (!isValidElement(node)) {
    return []
  }
  return collectText(node.props.children)
}

describe("workspace panels", () => {
  it("renders control panel switcher and workspace error text", () => {
    const rendered = WorkspaceControlPanel({
      currentWorkspaceId: "ws-1",
      isCreatingWorkspace: false,
      isWorkspaceLoading: false,
      workspaceErrorText: "Ошибка переключения",
      workspaces: [{ id: "ws-1", name: "Главное" }],
      renderSwitcher: ({ workspaces }) => (
        <div>{`Switcher count: ${workspaces.length}`}</div>
      ),
    })
    const text = collectText(rendered).join(" ")

    expect(text).toContain("Switcher count: 1")
    expect(text).toContain("Ошибка переключения")
  })

  it("renders workspace title and context", () => {
    const rendered = WorkspaceTitlePanel({
      title: "Продуктовая область",
      errorText: "Ошибка загрузки дерева",
    })
    const text = collectText(rendered).join(" ")

    expect(text).toContain("Продуктовая область")
    expect(text).toContain("Ошибка загрузки дерева")
  })
})
