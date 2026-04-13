"use client"

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  memo,
} from "react"
import type { TableColumnWidths } from "../../hooks/use-workspace-layout"
import type { FlatRow } from "../../state/workspace-tree-state"
import type { DropIntent, OverlayIndicator } from "../../tree-interactions"
import type { EditState } from "../../use-work-item-editing"
import {
  WorkspaceRatingCell,
  workspaceRatingFieldConfigs,
} from "../../workspace-ratings"

type MemoRowProps = {
  rowId: string
  parentId: string | null
  depth: number
  hasMultilineField: boolean
  className: string
  rowRenderSignature: string
  editRenderSignature: string
  registerRowElementRef: (
    rowId: string,
    node: HTMLTableRowElement | null,
  ) => void
  children: ReactNode
}

const MemoWorkRow = memo(
  function MemoWorkRow(props: MemoRowProps) {
    return (
      <tr
        ref={(node) => props.registerRowElementRef(props.rowId, node)}
        data-row-id={props.rowId}
        data-parent-id={props.parentId ?? "root"}
        data-depth={props.depth}
        data-multiline={props.hasMultilineField ? "true" : "false"}
        className={props.className}
      >
        {props.children}
      </tr>
    )
  },
  (prev, next) =>
    prev.rowId === next.rowId &&
    prev.parentId === next.parentId &&
    prev.depth === next.depth &&
    prev.hasMultilineField === next.hasMultilineField &&
    prev.className === next.className &&
    prev.rowRenderSignature === next.rowRenderSignature &&
    prev.editRenderSignature === next.editRenderSignature,
)

type WorkspaceTreeTableProps = {
  rows: FlatRow[]
  edits: Record<string, EditState>
  numberingById: Map<string, string>
  draggedRowId: string | null
  dropIntent: DropIntent | null
  tableColumnWidths: TableColumnWidths
  rowTreeIndentPx: number
  workContentIndentPx: number
  contentStartXPx: number
  frameXPx: number
  leftGutterWidthPx: number
  cellInlinePadPx: number
  structureLineWidthPx: number
  overlayHeight: number
  overlayAddIndicators: OverlayIndicator[]
  overlayDropY: number | null
  listScrollRef: React.RefObject<HTMLDivElement>
  tableWrapRef: React.RefObject<HTMLDivElement>
  tableRef: React.RefObject<HTMLTableElement>
  registerRowElementRef: (
    rowId: string,
    node: HTMLTableRowElement | null,
  ) => void
  registerTitleInputRef: (rowId: string, node: HTMLInputElement | null) => void
  registerTextareaRef: (key: string, node: HTMLTextAreaElement | null) => void
  onHandlePointerDown: (
    event: PointerEvent<HTMLButtonElement>,
    rowId: string,
  ) => void
  onHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onHandlePointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
  onCreateAtPosition: (parentId: string | null, targetIndex: number) => void
  onDeleteRow: (rowId: string) => void
  onCommitTextEdit: (rowId: string, patch: Partial<EditState>) => void
  onCommitEdit: (rowId: string, patch: Partial<EditState>) => void
  onFieldFocus: (rowId: string) => void
  onFieldBlur: (rowId: string) => void
  onTitleKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    rowId: string,
  ) => void
  onTitleBlurExtra: (rowId: string) => void
}

function autoGrowTextarea(target: HTMLTextAreaElement) {
  target.style.height = "auto"
  target.style.height = `${target.scrollHeight}px`
}

export function WorkspaceTreeTable(props: WorkspaceTreeTableProps) {
  return (
    <div className="list" ref={props.listScrollRef}>
      <div className="work-table-wrap" ref={props.tableWrapRef}>
        <table
          data-tree-table
          ref={props.tableRef}
          data-drop-intent={props.dropIntent?.type ?? "none"}
          data-drop-position={
            props.dropIntent?.type === "between"
              ? props.dropIntent.position
              : "none"
          }
          style={
            {
              "--work-col-width": props.tableColumnWidths.work,
              "--object-col-width": props.tableColumnWidths.object,
              "--overcomplication-col-width":
                props.tableColumnWidths.overcomplication,
              "--importance-col-width": props.tableColumnWidths.importance,
              "--blocks-money-col-width": props.tableColumnWidths.blocksMoney,
              "--problems-col-width": props.tableColumnWidths.currentProblems,
              "--solutions-col-width": props.tableColumnWidths.solutionVariants,
              "--removable-col-width": props.tableColumnWidths.removable,
              "--frame-x": `${props.frameXPx}px`,
              "--left-gutter-width": `${props.leftGutterWidthPx}px`,
              "--work-content-indent": `${props.workContentIndentPx}px`,
              "--cell-inline-pad": `${props.cellInlinePadPx}px`,
              "--content-start-x": `${props.contentStartXPx}px`,
              "--structure-line-width": `${props.structureLineWidthPx}px`,
            } as CSSProperties
          }
          className={[
            "work-table",
            props.dropIntent?.type === "root-start" ? "root-start-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <thead>
            <tr>
              <th className="work-col">Работа</th>
              <th className="object-col">Объект</th>
              {workspaceRatingFieldConfigs.map((field) => (
                <th
                  key={field.key}
                  className={`score-col ${field.columnClassName}`}
                >
                  {field.headerLabel}
                </th>
              ))}
              <th className="problems-col">Проблемы</th>
              <th className="solutions-col">Решения</th>
              <th className="removable-col">Возможно убрать</th>
              <th className="actions-col" aria-label="Удаление" />
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => {
              const edit = props.edits[row.id]
              if (!edit) {
                return null
              }
              const hasMultilineField =
                edit.currentProblems.includes("\n") ||
                edit.solutionVariants.includes("\n")
              const rowClassName = [
                props.draggedRowId === row.id ? "drag-source" : "",
                props.dropIntent?.type === "between" &&
                props.dropIntent.rowId === row.id
                  ? `drop-between-target-${props.dropIntent.position}`
                  : "",
                props.dropIntent?.type === "nest" &&
                props.dropIntent.targetId === row.id
                  ? "drop-nest-target"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
              const rowRenderSignature = `${row.id}:${row.parentId ?? "root"}:${row.siblingOrder}:${row.depth}`
              const editRenderSignature = [
                edit.title,
                edit.object,
                edit.overcomplication,
                edit.importance,
                edit.blocksMoney,
                edit.currentProblems,
                edit.solutionVariants,
                edit.possiblyRemovable ? "1" : "0",
              ].join("::")
              const isParentRow = row.children.length > 0
              return (
                <MemoWorkRow
                  key={row.id}
                  rowId={row.id}
                  parentId={row.parentId}
                  depth={row.depth}
                  hasMultilineField={hasMultilineField}
                  className={rowClassName}
                  rowRenderSignature={rowRenderSignature}
                  editRenderSignature={editRenderSignature}
                  registerRowElementRef={props.registerRowElementRef}
                >
                  <td className="work-col">
                    <div
                      className="cell-tree"
                      style={{ "--row-depth": row.depth } as CSSProperties}
                    >
                      <span className="work-number" aria-hidden>
                        {props.numberingById.get(row.id) ?? ""}
                      </span>
                      <button
                        type="button"
                        className="drag-handle"
                        aria-label="Перетащить задачу"
                        title="Перетащить задачу"
                        onPointerDown={(event) =>
                          props.onHandlePointerDown(event, row.id)
                        }
                        onPointerMove={props.onHandlePointerMove}
                        onPointerUp={props.onHandlePointerUp}
                        onPointerCancel={props.onHandlePointerCancel}
                      >
                        <i className="ri-draggable" aria-hidden />
                      </button>
                      <input
                        className="input-title"
                        key={`title:${row.id}:${edit.title}`}
                        ref={(node) =>
                          props.registerTitleInputRef(row.id, node)
                        }
                        style={{
                          paddingInlineStart: `${
                            row.depth * props.rowTreeIndentPx +
                            props.workContentIndentPx
                          }px`,
                        }}
                        defaultValue={edit.title}
                        placeholder="Название"
                        aria-label="Название"
                        onFocus={() => props.onFieldFocus(row.id)}
                        onKeyDown={(event) =>
                          props.onTitleKeyDown(event, row.id)
                        }
                        onBlur={(event) => {
                          props.onCommitTextEdit(row.id, {
                            title: event.currentTarget.value,
                          })
                          props.onFieldBlur(row.id)
                          props.onTitleBlurExtra(row.id)
                        }}
                      />
                    </div>
                  </td>
                  <td className="object-col">
                    <input
                      className="input-object"
                      key={`object:${row.id}:${edit.object}`}
                      defaultValue={edit.object}
                      placeholder="Объект"
                      aria-label="Объект"
                      onFocus={() => props.onFieldFocus(row.id)}
                      onBlur={(event) => {
                        props.onCommitTextEdit(row.id, {
                          object: event.currentTarget.value,
                        })
                        props.onFieldBlur(row.id)
                      }}
                    />
                  </td>
                  <WorkspaceRatingCell
                    field={workspaceRatingFieldConfigs[0]}
                    row={row}
                    editState={edit}
                    isParentRow={isParentRow}
                    onChange={(value) =>
                      props.onCommitEdit(row.id, { overcomplication: value })
                    }
                  />
                  <WorkspaceRatingCell
                    field={workspaceRatingFieldConfigs[1]}
                    row={row}
                    editState={edit}
                    isParentRow={isParentRow}
                    onChange={(value) =>
                      props.onCommitEdit(row.id, { importance: value })
                    }
                  />
                  <WorkspaceRatingCell
                    field={workspaceRatingFieldConfigs[2]}
                    row={row}
                    editState={edit}
                    isParentRow={isParentRow}
                    onChange={(value) =>
                      props.onCommitEdit(row.id, { blocksMoney: value })
                    }
                  />
                  <td className="problems-col">
                    <textarea
                      className="textarea-list"
                      ref={(node) =>
                        props.registerTextareaRef(
                          `currentProblems:${row.id}`,
                          node,
                        )
                      }
                      key={`currentProblems:${row.id}:${edit.currentProblems}`}
                      rows={1}
                      defaultValue={edit.currentProblems}
                      placeholder="Проблемы"
                      aria-label="Проблемы по строкам"
                      onFocus={() => props.onFieldFocus(row.id)}
                      onBlur={(event) => {
                        props.onCommitTextEdit(row.id, {
                          currentProblems: event.currentTarget.value,
                        })
                        props.onFieldBlur(row.id)
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          (event.ctrlKey || event.metaKey)
                        ) {
                          event.preventDefault()
                          props.onCommitTextEdit(row.id, {
                            currentProblems: event.currentTarget.value,
                          })
                        }
                      }}
                      onInput={(event) => autoGrowTextarea(event.currentTarget)}
                    />
                  </td>
                  <td className="solutions-col">
                    <textarea
                      className="textarea-list"
                      ref={(node) =>
                        props.registerTextareaRef(
                          `solutionVariants:${row.id}`,
                          node,
                        )
                      }
                      key={`solutionVariants:${row.id}:${edit.solutionVariants}`}
                      rows={1}
                      defaultValue={edit.solutionVariants}
                      placeholder="Решения"
                      aria-label="Решения по строкам"
                      onFocus={() => props.onFieldFocus(row.id)}
                      onBlur={(event) => {
                        props.onCommitTextEdit(row.id, {
                          solutionVariants: event.currentTarget.value,
                        })
                        props.onFieldBlur(row.id)
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          (event.ctrlKey || event.metaKey)
                        ) {
                          event.preventDefault()
                          props.onCommitTextEdit(row.id, {
                            solutionVariants: event.currentTarget.value,
                          })
                        }
                      }}
                      onInput={(event) => autoGrowTextarea(event.currentTarget)}
                    />
                  </td>
                  <td className="removable-col">
                    <label className="possibly-removable-control">
                      <input
                        type="checkbox"
                        checked={edit.possiblyRemovable}
                        aria-label="Возможно убрать"
                        onChange={(event) =>
                          props.onCommitEdit(row.id, {
                            possiblyRemovable: event.target.checked,
                          })
                        }
                        onFocus={() => props.onFieldFocus(row.id)}
                        onBlur={() => props.onFieldBlur(row.id)}
                      />
                    </label>
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon delete-handle"
                        onClick={() => props.onDeleteRow(row.id)}
                        aria-label="Удалить"
                        title="Удалить"
                      >
                        <i className="ri-delete-bin-line" aria-hidden />
                      </button>
                    </div>
                  </td>
                </MemoWorkRow>
              )
            })}
          </tbody>
        </table>
        <div
          className="work-table-overlay"
          style={
            {
              height: `${props.overlayHeight}px`,
              "--work-col-width": props.tableColumnWidths.work,
              "--content-start-x": `${props.contentStartXPx}px`,
            } as CSSProperties
          }
        >
          {props.overlayAddIndicators.map((indicator) => (
            <div
              key={indicator.laneId}
              className="overlay-add-lane"
              style={{ top: `${indicator.y}px` }}
            >
              <div className="overlay-add-hotspot" aria-hidden>
                <button
                  type="button"
                  className="overlay-add-plus"
                  aria-label="Добавить работу между строками"
                  title="Добавить работу"
                  onClick={() =>
                    props.onCreateAtPosition(
                      indicator.parentId,
                      indicator.targetIndex,
                    )
                  }
                >
                  <i className="ri-add-line" aria-hidden />
                </button>
              </div>
              <span className="overlay-add-line" aria-hidden />
            </div>
          ))}
          {props.overlayDropY !== null ? (
            <div
              className="overlay-drop-line"
              aria-hidden
              style={{
                top: `${Math.round(props.overlayDropY)}px`,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
