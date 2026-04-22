"use client"

import {
  ViewportScrollbar,
  WorkspaceControlPanel,
  WorkspaceMindmap,
  WorkspaceTitlePanel,
  WorkspaceTreeTable,
  WorkspaceViewLayout,
} from "@ood/ui"
import { useWorkspaceClientComposition } from "./hooks/use-workspace-client-composition"

export function WorkspaceClient() {
  const vm = useWorkspaceClientComposition()

  return (
    <main>
      <div className="workspace">
        <WorkspaceControlPanel
          currentWorkspaceId={vm.currentWorkspaceId}
          isCreatingWorkspace={vm.isCreatingWorkspace}
          isWorkspaceLoading={vm.isWorkspaceLoading}
          workspaceErrorText={vm.workspaceErrorText}
          className="section section-column-start workspace-switcher-row"
          workspaces={vm.workspaces}
          renderSwitcher={vm.handlers.renderSwitcher}
        />
        <WorkspaceTitlePanel
          title={vm.currentWorkspaceName}
          errorText={vm.errorText}
          className="section section-column-start"
          viewMode={vm.viewMode}
          onViewModeChange={vm.handlers.setViewMode}
        />
        <section className="section">
          <WorkspaceViewLayout
            viewMode={vm.viewMode}
            primary={
              <>
                {vm.isLoading ? <p className="list-loading">Загрузка</p> : null}
                <WorkspaceTreeTable
                  rows={vm.rows}
                  collapsedRowIds={vm.collapsedRowIds}
                  rowUiById={vm.rowUiById}
                  numberingById={vm.numberingById}
                  draggedRowId={vm.dnd.draggedRowId}
                  dropIntent={vm.dnd.dropIntent}
                  dragPreview={
                    vm.dnd.dragPreviewPosition && vm.dnd.draggedRowId
                      ? {
                          x: vm.dnd.dragPreviewPosition.x,
                          y: vm.dnd.dragPreviewPosition.y,
                          title:
                            vm.rowUiById[vm.dnd.draggedRowId]?.title.value ??
                            "Без названия",
                        }
                      : null
                  }
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
                  overlayNestTarget={vm.overlayNestTarget}
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
                  onToggleRowCollapse={vm.handlers.toggleRowCollapse}
                  onActivateRowForEditing={vm.handlers.activateRowForEditing}
                />
              </>
            }
            secondary={
              <WorkspaceMindmap
                nodes={vm.mindmap.diagram.nodes}
                edges={vm.mindmap.diagram.edges}
                activeNodeIds={vm.mindmap.activeNodeIds}
                editingNodeIds={vm.mindmap.editingNodeIds}
                viewport={vm.mindmap.viewport}
                viewportFrameRef={vm.mindmap.viewportFrameRef}
                onViewportChange={vm.mindmap.onViewportChange}
                emptyMessage="Нет данных для mindmap"
                ariaLabel="Mindmap структуры работ"
              />
            }
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
