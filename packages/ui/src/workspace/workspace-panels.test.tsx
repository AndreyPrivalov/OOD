import type { ReactNode } from "react"
import { isValidElement } from "react"
import { describe, expect, it } from "vitest"
import { WorkspaceControlPanel } from "./workspace-control-panel"
import { WorkspaceTitlePanel } from "./workspace-title-panel"
import { WorkspaceViewLayout } from "./workspace-view-layout"

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

function collectButtons(node: ReactNode): Array<{
  text: string
  className: string | undefined
  pressed: boolean | undefined
  title: string | undefined
  onClick: (() => void) | undefined
}> {
  if (Array.isArray(node)) {
    return node.flatMap((entry) => collectButtons(entry))
  }
  if (!isValidElement(node)) {
    return []
  }

  const own =
    node.type === "button"
      ? [
          {
            text: collectText(node.props.children).join(" "),
            className: node.props.className as string | undefined,
            pressed: node.props["aria-pressed"] as boolean | undefined,
            title: node.props.title as string | undefined,
            onClick: node.props.onClick as (() => void) | undefined,
          },
        ]
      : []

  return [...own, ...collectButtons(node.props.children)]
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
      viewMode: "split",
      onViewModeChange: () => {},
    })
    const text = collectText(rendered).join(" ")

    expect(text).toContain("Продуктовая область")
    expect(text).toContain("Ошибка загрузки дерева")
    expect(text).toContain("Показывать дерево")
  })

  it("marks active mode and calls switch handler", () => {
    const modeChanges: string[] = []
    const rendered = WorkspaceTitlePanel({
      title: "Продуктовая область",
      viewMode: "table-only",
      onViewModeChange: (mode) => {
        modeChanges.push(mode)
      },
    })
    const buttons = collectButtons(rendered)
    const treeSwitch = buttons.find((button) =>
      button.text.includes("Показывать дерево"),
    )

    expect(treeSwitch?.pressed).toBe(false)
    expect(treeSwitch?.className).toContain("workspace-view-toggle")
    expect(treeSwitch?.className).not.toContain("is-active")
    expect(treeSwitch?.title).toBe("Показывать дерево")

    treeSwitch?.onClick?.()
    expect(treeSwitch?.className).toContain("workspace-view-toggle")

    expect(modeChanges).toEqual(["split"])
  })

  it("renders secondary pane only in split mode", () => {
    const rendered = WorkspaceViewLayout({
      viewMode: "split",
      primary: <div>Table</div>,
      secondary: <div>Mindmap</div>,
    })
    const text = collectText(rendered).join(" ")

    expect(text).toContain("Table")
    expect(text).toContain("Mindmap")
  })

  it("keeps only the primary pane in table-only mode", () => {
    const rendered = WorkspaceViewLayout({
      viewMode: "table-only",
      primary: <div>Table</div>,
      secondary: <div>Mindmap</div>,
    })
    const text = collectText(rendered).join(" ")

    expect(text).toContain("Table")
    expect(text).not.toContain("Mindmap")
  })
})
