import type { ReactNode } from "react"
import { isValidElement } from "react"
import { describe, expect, it } from "vitest"
import {
  WorkspaceTreeTable,
  buildRowRenderSignature,
} from "./workspace-tree-table"

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

describe("WorkspaceTreeTable", () => {
  it("renders table headers, rows, and overlay controls", () => {
    const rendered = WorkspaceTreeTable({
      rows: [
        {
          id: "row-1",
          parentId: null,
          depth: 0,
          siblingOrder: 0,
          children: [],
          overcomplication: 2,
          importance: 4,
        },
      ],
      collapsedRowIds: new Set<string>(),
      rowUiById: {
        "row-1": {
          title: {
            value: "Первая работа",
            registerTextareaRef: () => {},
            onFocus: () => {},
            onBlur: () => {},
            onKeyDown: () => {},
            onInput: () => {},
          },
          object: {
            value: "Объект A",
            onFocus: () => {},
            onBlur: () => {},
          },
          currentProblems: {
            value: "Проблема",
            registerTextareaRef: () => {},
            onFocus: () => {},
            onBlur: () => {},
          },
          solutionVariants: {
            value: "Решение",
            registerTextareaRef: () => {},
            onFocus: () => {},
            onBlur: () => {},
          },
          possiblyRemovable: {
            checked: false,
            onFocus: () => {},
            onBlur: () => {},
            onChange: () => {},
          },
          ratingCells: (
            <>
              <td className="score-col">R1</td>
              <td className="score-col">R2</td>
              <td className="score-col">M1</td>
              <td className="score-col">M2</td>
            </>
          ),
          renderSignature: "sig",
        },
      },
      numberingById: new Map([["row-1", "1"]]),
      draggedRowId: null,
      dropIntent: null,
      tableColumnWidths: {
        work: "320px",
        object: "180px",
        overcomplication: "120px",
        importance: "120px",
        currentProblems: "220px",
        solutionVariants: "220px",
        removable: "140px",
      },
      ratingHeaders: [
        {
          key: "overcomplication",
          headerLabel: "Сложно",
          columnClassName: "overcomplication-col",
        },
        {
          key: "importance",
          headerLabel: "Важно",
          columnClassName: "importance-col",
        },
        {
          key: "metric:impact",
          headerLabel: "Impact",
          columnClassName: "workspace-metric-col",
        },
        {
          key: "metric:risk",
          headerLabel: "Risk",
          columnClassName: "workspace-metric-col",
        },
      ],
      rowTreeIndentPx: 24,
      workContentIndentPx: 12,
      contentStartXPx: 80,
      frameXPx: 16,
      leftGutterWidthPx: 24,
      cellInlinePadPx: 8,
      structureLineWidthPx: 1,
      overlayHeight: 480,
      overlayAddIndicators: [
        {
          kind: "add",
          laneId: "lane-1",
          y: 40,
          contentStartXPx: 80,
          parentId: null,
          targetIndex: 0,
          showPlus: true,
        },
      ],
      overlayDropY: null,
      overlayNestTarget: null,
      dragPreview: null,
      listScrollRef: { current: null },
      tableWrapRef: { current: null },
      tableRef: { current: null },
      registerRowElementRef: () => {},
      onHandlePointerDown: () => {},
      onHandlePointerMove: () => {},
      onHandlePointerUp: () => {},
      onHandlePointerCancel: () => {},
      onCreateAtPosition: () => {},
      onDeleteRow: () => {},
      onToggleRowCollapse: () => {},
    })
    const text = collectText(rendered).join(" ")

    expect(text).toContain("Работа")
    expect(text).toContain("R1")
    expect(text).toContain("Impact")
    expect(text).not.toContain("Не доплачивает")
  })

  it("changes row render signature when parent aggregate sums change", () => {
    const base = {
      id: "parent-row",
      parentId: null,
      depth: 0,
      siblingOrder: 0,
      children: [{ id: "leaf" }],
      overcomplication: null,
      importance: null,
      overcomplicationSum: 2,
      importanceSum: 1,
    }

    const before = buildRowRenderSignature(base)
    const after = buildRowRenderSignature({
      ...base,
      overcomplicationSum: 5,
    })

    expect(after).not.toBe(before)
  })

  it("renders centered empty-state action when there are no rows", () => {
    const rendered = WorkspaceTreeTable({
      rows: [],
      collapsedRowIds: new Set<string>(),
      rowUiById: {},
      numberingById: new Map(),
      draggedRowId: null,
      dropIntent: null,
      tableColumnWidths: {
        work: "320px",
        object: "180px",
        overcomplication: "120px",
        importance: "120px",
        currentProblems: "220px",
        solutionVariants: "220px",
        removable: "140px",
      },
      ratingHeaders: [
        {
          key: "overcomplication",
          headerLabel: "Сложно",
          columnClassName: "overcomplication-col",
        },
      ],
      rowTreeIndentPx: 24,
      workContentIndentPx: 12,
      contentStartXPx: 80,
      frameXPx: 16,
      leftGutterWidthPx: 24,
      cellInlinePadPx: 8,
      structureLineWidthPx: 1,
      overlayHeight: 240,
      overlayAddIndicators: [
        {
          kind: "add",
          laneId: "empty-lane",
          y: 20,
          contentStartXPx: 80,
          parentId: null,
          targetIndex: 0,
          showPlus: true,
        },
      ],
      overlayDropY: null,
      overlayNestTarget: null,
      dragPreview: null,
      listScrollRef: { current: null },
      tableWrapRef: { current: null },
      tableRef: { current: null },
      registerRowElementRef: () => {},
      onHandlePointerDown: () => {},
      onHandlePointerMove: () => {},
      onHandlePointerUp: () => {},
      onHandlePointerCancel: () => {},
      onCreateAtPosition: () => {},
      onDeleteRow: () => {},
      onToggleRowCollapse: () => {},
    })

    const text = collectText(rendered).join(" ")
    expect(text).toContain("Добавить работу")
  })
})
