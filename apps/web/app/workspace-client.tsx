"use client"

import {
  ViewportScrollbar,
  WorkspaceControlPanel,
  WorkspaceTitlePanel,
  WorkspaceTreeTable,
} from "@ood/ui"
import { useMemo } from "react"
import { useWorkspaceClientComposition } from "./hooks/use-workspace-client-composition"

export function WorkspaceClient() {
  const vm = useWorkspaceClientComposition()

  const rowUiById = useMemo(() => {
    const next = {} as Parameters<typeof WorkspaceTreeTable>[0]["rowUiById"]
    for (const row of vm.rows) {
      const edit = vm.rowEdits[row.id]
      if (!edit) {
        continue
      }
      const isParentRow = row.children.length > 0
      const commitEdit = (patch: Partial<typeof edit>) => {
        vm.handlers.commitEdit(row.id, patch)
      }

      next[row.id] = {
        title: {
          value: edit.title,
          registerInputRef: (node) =>
            vm.layout.registerTitleInputRef(row.id, node),
          onFocus: () => vm.handlers.handleFieldFocus(row.id),
          onKeyDown: (event) => vm.handlers.handleTitleKeyDown(event, row.id),
          onBlur: (value) => {
            vm.handlers.commitTextEdit(row.id, { title: value })
            vm.handlers.handleFieldBlur(row.id)
            vm.handlers.handleTitleBlur(row.id)
          },
        },
        object: {
          value: edit.object,
          onFocus: () => vm.handlers.handleFieldFocus(row.id),
          onBlur: (value) => {
            vm.handlers.commitTextEdit(row.id, { object: value })
            vm.handlers.handleFieldBlur(row.id)
          },
        },
        currentProblems: {
          value: edit.currentProblems,
          registerTextareaRef: (node) =>
            vm.layout.registerTextareaRef(`${row.id}:currentProblems`, node),
          onFocus: () => vm.handlers.handleFieldFocus(row.id),
          onBlur: (value) => {
            vm.handlers.commitTextEdit(row.id, { currentProblems: value })
            vm.handlers.handleFieldBlur(row.id)
          },
          onInput: (target) => {
            target.style.height = "auto"
            target.style.height = `${target.scrollHeight}px`
          },
        },
        solutionVariants: {
          value: edit.solutionVariants,
          registerTextareaRef: (node) =>
            vm.layout.registerTextareaRef(`${row.id}:solutionVariants`, node),
          onFocus: () => vm.handlers.handleFieldFocus(row.id),
          onBlur: (value) => {
            vm.handlers.commitTextEdit(row.id, { solutionVariants: value })
            vm.handlers.handleFieldBlur(row.id)
          },
          onInput: (target) => {
            target.style.height = "auto"
            target.style.height = `${target.scrollHeight}px`
          },
        },
        possiblyRemovable: {
          checked: edit.possiblyRemovable,
          onFocus: () => vm.handlers.handleFieldFocus(row.id),
          onBlur: () => vm.handlers.handleFieldBlur(row.id),
          onChange: (checked) => commitEdit({ possiblyRemovable: checked }),
        },
        ratingCells: vm.handlers.renderRatingCells({
          edit,
          isParentRow,
          onCommitEdit: commitEdit,
          row,
        }),
        renderSignature: [
          edit.title,
          edit.object,
          edit.currentProblems,
          edit.solutionVariants,
          edit.possiblyRemovable ? "1" : "0",
          edit.overcomplication,
          edit.importance,
          edit.blocksMoney,
          isParentRow ? "1" : "0",
        ].join("||"),
      }
    }
    return next
  }, [vm])

  return (
    <main>
      <div className="workspace">
        <WorkspaceControlPanel
          currentWorkspaceId={vm.currentWorkspaceId}
          isCreatingWorkspace={vm.isCreatingWorkspace}
          isWorkspaceLoading={vm.isWorkspaceLoading}
          workspaceErrorText={vm.workspaceErrorText}
          workspaces={vm.workspaces}
          renderSwitcher={vm.handlers.renderSwitcher}
        />
        <WorkspaceTitlePanel
          title="Работы"
          currentWorkspaceName={vm.currentWorkspaceName}
          errorText={vm.errorText}
        />
        <section className="section">
          {vm.isLoading ? <p className="list-loading">Загрузка</p> : null}
          {!vm.isLoading && vm.rows.length === 0 ? (
            <p className="list-empty">Пусто</p>
          ) : null}
          <WorkspaceTreeTable
            rows={vm.rows}
            rowUiById={rowUiById}
            numberingById={vm.numberingById}
            draggedRowId={vm.dnd.draggedRowId}
            dropIntent={vm.dnd.dropIntent}
            tableColumnWidths={vm.layout.tableColumnWidths}
            ratingHeaders={vm.workspaceRatingFieldConfigs}
            rowTreeIndentPx={vm.tableFrame.TREE_LEVEL_OFFSET_PX}
            workContentIndentPx={vm.tableFrame.WORK_CONTENT_INDENT_PX}
            contentStartXPx={vm.tableFrame.CONTENT_START_X_PX}
            frameXPx={vm.tableFrame.FRAME_X_PX}
            leftGutterWidthPx={vm.tableFrame.LEFT_GUTTER_WIDTH_PX}
            cellInlinePadPx={vm.tableFrame.CELL_INLINE_PAD_PX}
            structureLineWidthPx={vm.tableFrame.STRUCTURE_LINE_WIDTH_PX}
            overlayHeight={vm.layout.overlayHeight}
            overlayAddIndicators={vm.overlayAddIndicators}
            overlayDropY={vm.overlayDropY}
            listScrollRef={vm.layout.listScrollRef}
            tableWrapRef={vm.layout.tableWrapRef}
            tableRef={vm.layout.tableRef}
            registerRowElementRef={vm.layout.registerRowElementRef}
            onHandlePointerDown={vm.dnd.handleHandlePointerDown}
            onHandlePointerMove={vm.dnd.handleHandlePointerMove}
            onHandlePointerUp={vm.dnd.handleHandlePointerUp}
            onHandlePointerCancel={vm.dnd.handleHandlePointerCancel}
            onCreateAtPosition={(parentId, targetIndex) => {
              void vm.handlers.createRowAtPosition(parentId, targetIndex)
            }}
            onDeleteRow={(rowId) => {
              void vm.handlers.deleteRow(rowId)
            }}
          />
        </section>
      </div>
      <ViewportScrollbar
        show={vm.layout.showViewportScrollbar}
        width={vm.layout.viewportScrollbarWidth}
        scrollbarRef={vm.layout.viewportScrollbarRef}
      />
    </main>
  )
}
