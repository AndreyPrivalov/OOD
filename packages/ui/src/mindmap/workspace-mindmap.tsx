import {
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  MindmapEdge,
  MindmapNode,
  MindmapViewport,
  MindmapViewportChangeMeta,
} from "./types"

const DEFAULT_NODE_WIDTH = 96
const DEFAULT_NODE_HEIGHT = 22
const DEFAULT_MIN_ZOOM = 0.4
const DEFAULT_MAX_ZOOM = 2.2
const DEFAULT_ZOOM_STEP = 0.12
const EDGE_BRANCH_GAP = 28
const EDGE_BEND_RADIUS = 16
const NODE_TEXT_LEFT_PADDING = 10
const NODE_TEXT_CONNECTION_GAP = 6

type WorkspaceMindmapProps = {
  nodes: MindmapNode[]
  edges: MindmapEdge[]
  viewport: MindmapViewport
  onViewportChange: (
    next: MindmapViewport,
    meta: MindmapViewportChangeMeta,
  ) => void
  activeNodeIds?: readonly string[]
  editingNodeIds?: readonly string[]
  className?: string
  emptyMessage?: string
  minZoom?: number
  maxZoom?: number
  zoomStep?: number
  ariaLabel?: string
  viewportFrameRef?: MutableRefObject<HTMLDivElement | null>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function WorkspaceMindmap(props: WorkspaceMindmapProps) {
  const [isPanning, setIsPanning] = useState(false)
  const [labelWidthById, setLabelWidthById] = useState<Map<string, number>>(
    () => new Map(),
  )
  const dragRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
  } | null>(null)
  const internalFrameRef = useRef<HTMLDivElement | null>(null)
  const textRefById = useRef(new Map<string, SVGTextElement>())

  const nodesById = useMemo(() => {
    const map = new Map<string, MindmapNode>()
    for (const node of props.nodes) {
      map.set(node.id, node)
    }
    return map
  }, [props.nodes])

  const activeNodeIds = useMemo(
    () => new Set(props.activeNodeIds ?? []),
    [props.activeNodeIds],
  )
  const editingNodeIds = useMemo(
    () => new Set(props.editingNodeIds ?? []),
    [props.editingNodeIds],
  )
  const childNodesByParentId = useMemo(() => {
    const map = new Map<string, MindmapNode[]>()
    for (const edge of props.edges) {
      const parent = nodesById.get(edge.fromId)
      const child = nodesById.get(edge.toId)
      if (!parent || !child) {
        continue
      }
      const bucket = map.get(parent.id)
      if (bucket) {
        bucket.push(child)
        continue
      }
      map.set(parent.id, [child])
    }
    for (const children of map.values()) {
      children.sort((left, right) => {
        const leftCenterY = left.y + (left.height ?? DEFAULT_NODE_HEIGHT) / 2
        const rightCenterY = right.y + (right.height ?? DEFAULT_NODE_HEIGHT) / 2
        return leftCenterY - rightCenterY
      })
    }
    return map
  }, [nodesById, props.edges])

  useEffect(() => {
    const next = new Map<string, number>()
    for (const [id, node] of textRefById.current.entries()) {
      const width = node.getComputedTextLength()
      if (Number.isFinite(width) && width > 0) {
        next.set(id, width)
      }
    }
    setLabelWidthById((previous) => {
      if (previous.size === next.size) {
        let isSame = true
        for (const [id, width] of next.entries()) {
          const prevWidth = previous.get(id)
          if (prevWidth === undefined || Math.abs(prevWidth - width) > 0.5) {
            isSame = false
            break
          }
        }
        if (isSame) {
          return previous
        }
      }
      return next
    })
  })

  const minZoom = props.minZoom ?? DEFAULT_MIN_ZOOM
  const maxZoom = props.maxZoom ?? DEFAULT_MAX_ZOOM
  const zoomStep = props.zoomStep ?? DEFAULT_ZOOM_STEP

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - drag.clientX
    const deltaY = event.clientY - drag.clientY
    if (deltaX === 0 && deltaY === 0) {
      return
    }
    dragRef.current = {
      ...drag,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    props.onViewportChange(
      {
        x: props.viewport.x + deltaX,
        y: props.viewport.y + deltaY,
        zoom: props.viewport.zoom,
      },
      { reason: "pan" },
    )
  }

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleWheel = (event: WheelEvent) => {
    const frameElement =
      props.viewportFrameRef?.current ?? internalFrameRef.current
    if (!frameElement) {
      return
    }
    event.preventDefault()
    event.stopPropagation()

    const direction = event.deltaY < 0 ? 1 : -1
    const zoomFactor = 1 + zoomStep * direction
    const currentZoom = props.viewport.zoom
    const nextZoom = clamp(currentZoom * zoomFactor, minZoom, maxZoom)

    if (nextZoom === currentZoom) {
      return
    }

    const rect = frameElement.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const worldX = (localX - props.viewport.x) / currentZoom
    const worldY = (localY - props.viewport.y) / currentZoom

    props.onViewportChange(
      {
        x: localX - worldX * nextZoom,
        y: localY - worldY * nextZoom,
        zoom: nextZoom,
      },
      { reason: "zoom" },
    )
  }

  useEffect(() => {
    const frameElement = internalFrameRef.current
    if (!frameElement) {
      return
    }

    frameElement.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      frameElement.removeEventListener("wheel", handleWheel)
    }
  })

  const className = [props.className, "workspace-mindmap"]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      ref={(node) => {
        internalFrameRef.current = node
        if (props.viewportFrameRef) {
          props.viewportFrameRef.current = node
        }
      }}
      className={className}
      style={{
        ...frameStyle,
        cursor: isPanning ? "grabbing" : "grab",
      }}
      role="img"
      aria-label={props.ariaLabel ?? "Mindmap рабочей структуры"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
    >
      {props.nodes.length === 0 ? (
        <div style={emptyStyle}>
          {props.emptyMessage ?? "Нет узлов для отображения"}
        </div>
      ) : null}
      <svg width="100%" height="100%" style={svgStyle}>
        <title>{props.ariaLabel ?? "Mindmap рабочей структуры"}</title>
        <g transform={`translate(${props.viewport.x} ${props.viewport.y})`}>
          <g transform={`scale(${props.viewport.zoom})`}>
            {[...childNodesByParentId.entries()].map(
              ([parentId, childNodes]) => {
                const parentNode = nodesById.get(parentId)
                if (!parentNode || childNodes.length === 0) {
                  return null
                }
                const parentHeight = parentNode.height ?? DEFAULT_NODE_HEIGHT
                const fallbackWidth =
                  (parentNode.width ?? DEFAULT_NODE_WIDTH) -
                  NODE_TEXT_LEFT_PADDING
                const textWidth =
                  labelWidthById.get(parentId) ?? Math.max(0, fallbackWidth)
                const parentX =
                  parentNode.x +
                  NODE_TEXT_LEFT_PADDING +
                  textWidth +
                  NODE_TEXT_CONNECTION_GAP
                const parentY = parentNode.y + parentHeight / 2
                const minChildX = Math.min(...childNodes.map((node) => node.x))
                const branchGap = Math.max(
                  8,
                  Math.min(EDGE_BRANCH_GAP, minChildX - parentX - 12),
                )
                const splitX = parentX + branchGap

                return (
                  <g key={parentId}>
                    <path
                      className="workspace-mindmap-edge"
                      d={`M ${parentX} ${parentY} H ${splitX}`}
                      style={edgeStyle}
                    />
                    {childNodes.map((childNode) => {
                      const childCenterY =
                        childNode.y +
                        (childNode.height ?? DEFAULT_NODE_HEIGHT) / 2
                      const hasAlignedCenter =
                        Math.abs(childCenterY - parentY) <= 0.5
                      const maxRadius = Math.max(
                        0,
                        Math.min(
                          EDGE_BEND_RADIUS,
                          Math.abs(childCenterY - parentY),
                          (childNode.x - splitX) / 2,
                        ),
                      )
                      const edgePath = hasAlignedCenter
                        ? `M ${splitX} ${parentY} H ${childNode.x}`
                        : [
                            `M ${splitX} ${parentY}`,
                            `V ${childCenterY > parentY ? childCenterY - maxRadius : childCenterY + maxRadius}`,
                            `Q ${splitX} ${childCenterY} ${splitX + maxRadius} ${childCenterY}`,
                            `H ${childNode.x}`,
                          ].join(" ")

                      return (
                        <path
                          key={`${parentId}__${childNode.id}`}
                          className="workspace-mindmap-edge"
                          d={edgePath}
                          style={edgeStyle}
                        />
                      )
                    })}
                  </g>
                )
              },
            )}
            {props.nodes.map((node) => {
              const height = node.height ?? DEFAULT_NODE_HEIGHT
              const isEditing = editingNodeIds.has(node.id)
              const isActive = activeNodeIds.has(node.id)

              return (
                <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                  <text
                    ref={(element) => {
                      if (element) {
                        textRefById.current.set(node.id, element)
                        return
                      }
                      textRefById.current.delete(node.id)
                    }}
                    x={NODE_TEXT_LEFT_PADDING}
                    y={height / 2 + 1}
                    style={{
                      ...labelStyle,
                      ...(isEditing ? labelEditingStyle : null),
                      ...(isActive ? labelActiveStyle : null),
                    }}
                    dominantBaseline="middle"
                  >
                    {node.label}
                  </text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
      <div
        style={hudStyle}
      >{`Zoom ${Math.round(props.viewport.zoom * 100)}%`}</div>
    </div>
  )
}

const frameStyle: CSSProperties = {
  position: "relative",
  minHeight: "320px",
  border: "1px solid var(--line)",
  borderRadius: "12px",
  background:
    "linear-gradient(180deg, rgba(26, 32, 36, 0.02) 0%, rgba(26, 32, 36, 0.05) 100%)",
  overflow: "hidden",
  overscrollBehavior: "contain",
  touchAction: "none",
  userSelect: "none",
}

const svgStyle: CSSProperties = {
  position: "relative",
  display: "block",
}

const edgeStyle: CSSProperties = {
  stroke: "rgba(116, 120, 124, 0.45)",
  strokeWidth: 1.5,
  vectorEffect: "non-scaling-stroke",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
}

const labelStyle: CSSProperties = {
  fill: "var(--fg)",
  fontSize: "var(--text-main)",
  fontWeight: 400,
  fontFamily: 'var(--font-sans), "Segoe UI", sans-serif',
  lineHeight: 1.4,
  pointerEvents: "none",
}

const labelActiveStyle: CSSProperties = {
  fill: "var(--accent)",
}

const labelEditingStyle: CSSProperties = {
  fill: "rgba(26, 61, 40, 0.98)",
}

const hudStyle: CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "12px",
  background: "rgba(255, 255, 255, 0.84)",
  border: "1px solid rgba(35, 44, 50, 0.12)",
  borderRadius: "999px",
  padding: "2px 8px",
  fontSize: "12px",
  color: "rgba(35, 44, 50, 0.74)",
}

const emptyStyle: CSSProperties = {
  position: "absolute",
  inset: "0",
  display: "grid",
  placeItems: "center",
  color: "rgba(35, 44, 50, 0.66)",
  fontSize: "14px",
}
