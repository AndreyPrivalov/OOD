"use client"

import type { MindmapViewport, MindmapViewportChangeMeta } from "@ood/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type MindmapNodeLike = {
  id: string
  x: number
  y: number
  width?: number
  height?: number
}

type Rect = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type Size = {
  width: number
  height: number
}

type UseMindmapViewportControllerOptions = {
  nodes: MindmapNodeLike[]
  editingNodeIds: readonly string[]
  autoFrameKey?: number
  initialViewport: MindmapViewport
  minZoom?: number
  maxZoom?: number
  framePaddingPx?: number
}

const DEFAULT_NODE_WIDTH = 96
const DEFAULT_NODE_HEIGHT = 22
const DEFAULT_MIN_ZOOM = 0.4
const DEFAULT_MAX_ZOOM = 2.2
const DEFAULT_FRAME_PADDING_PX = 24
const AUTO_FRAME_MIN_ZOOM = 0.6
const AUTO_FRAME_MAX_ZOOM = 0.85
const AUTO_FRAME_FIT_MARGIN_RATIO = 0.92
const AUTO_FRAME_FOCUS_X_RATIO = 0.36
const AUTO_FRAME_DURATION_MS = 240

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3
}

function readFrameSizeFromElement(
  frameElement: HTMLDivElement | null,
): Size | null {
  if (!frameElement) {
    return null
  }
  const rect = frameElement.getBoundingClientRect()
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  if (width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

export function buildNodeRect(node: MindmapNodeLike): Rect {
  return {
    minX: node.x,
    minY: node.y,
    maxX: node.x + (node.width ?? DEFAULT_NODE_WIDTH),
    maxY: node.y + (node.height ?? DEFAULT_NODE_HEIGHT),
  }
}

function mergeRects(base: Rect | null, next: Rect): Rect {
  if (!base) {
    return next
  }
  return {
    minX: Math.min(base.minX, next.minX),
    minY: Math.min(base.minY, next.minY),
    maxX: Math.max(base.maxX, next.maxX),
    maxY: Math.max(base.maxY, next.maxY),
  }
}

export function buildContentBounds(nodes: MindmapNodeLike[]): Rect | null {
  let bounds: Rect | null = null
  for (const node of nodes) {
    bounds = mergeRects(bounds, buildNodeRect(node))
  }
  return bounds
}

export function buildBoundsById(nodes: MindmapNodeLike[]): Map<string, Rect> {
  const map = new Map<string, Rect>()
  for (const node of nodes) {
    map.set(node.id, buildNodeRect(node))
  }
  return map
}

export function buildContextBounds(
  nodeBoundsById: ReadonlyMap<string, Rect>,
  editingNodeIds: readonly string[],
): Rect | null {
  let bounds: Rect | null = null
  for (const nodeId of editingNodeIds) {
    const nodeBounds = nodeBoundsById.get(nodeId)
    if (!nodeBounds) {
      continue
    }
    bounds = mergeRects(bounds, nodeBounds)
  }
  return bounds
}

function fitViewportAxis(options: {
  contentMin: number
  contentMax: number
  frameSize: number
  zoom: number
  padding: number
  value: number
  centerWhenContentFits: boolean
}) {
  const {
    centerWhenContentFits,
    contentMax,
    contentMin,
    frameSize,
    padding,
    value,
    zoom,
  } = options
  const contentSize = (contentMax - contentMin) * zoom
  if (contentSize <= frameSize - padding * 2) {
    if (centerWhenContentFits) {
      return (frameSize - contentSize) / 2 - contentMin * zoom
    }
    const lowerBound = padding - contentMin * zoom
    const upperBound = frameSize - padding - contentMax * zoom
    return clamp(value, lowerBound, upperBound)
  }
  const minValue = frameSize - padding - contentMax * zoom
  const maxValue = padding - contentMin * zoom
  return clamp(value, minValue, maxValue)
}

export function clampViewportToBounds(options: {
  viewport: MindmapViewport
  frameSize: Size
  contentBounds: Rect | null
  minZoom: number
  maxZoom: number
  padding: number
  centerWhenContentFits?: boolean
}): MindmapViewport {
  const {
    centerWhenContentFits = true,
    contentBounds,
    frameSize,
    maxZoom,
    minZoom,
    padding,
    viewport,
  } = options
  const zoom = clamp(viewport.zoom, minZoom, maxZoom)
  if (!contentBounds || frameSize.width <= 0 || frameSize.height <= 0) {
    return { ...viewport, zoom }
  }
  return {
    x: fitViewportAxis({
      contentMin: contentBounds.minX,
      contentMax: contentBounds.maxX,
      frameSize: frameSize.width,
      zoom,
      padding,
      value: viewport.x,
      centerWhenContentFits,
    }),
    y: fitViewportAxis({
      contentMin: contentBounds.minY,
      contentMax: contentBounds.maxY,
      frameSize: frameSize.height,
      zoom,
      padding,
      value: viewport.y,
      centerWhenContentFits,
    }),
    zoom,
  }
}

export function computeAutoFrameViewport(options: {
  viewport: MindmapViewport
  frameSize: Size
  contextBounds: Rect
  focusBounds: Rect | null
  contentBounds: Rect | null
  minZoom: number
  maxZoom: number
  padding: number
}): MindmapViewport {
  const {
    contentBounds,
    contextBounds,
    frameSize,
    focusBounds,
    maxZoom,
    minZoom,
    padding,
    viewport,
  } = options
  if (frameSize.width <= 0 || frameSize.height <= 0) {
    return viewport
  }

  const contextWidth = Math.max(1, contextBounds.maxX - contextBounds.minX)
  const contextHeight = Math.max(1, contextBounds.maxY - contextBounds.minY)
  const availableWidth = Math.max(1, frameSize.width - padding * 2)
  const availableHeight = Math.max(1, frameSize.height - padding * 2)
  const fitZoom = Math.min(
    availableWidth / contextWidth,
    availableHeight / contextHeight,
  )
  const adaptiveZoom = clamp(
    fitZoom * AUTO_FRAME_FIT_MARGIN_RATIO,
    AUTO_FRAME_MIN_ZOOM,
    AUTO_FRAME_MAX_ZOOM,
  )
  const targetZoom = clamp(adaptiveZoom, minZoom, maxZoom)
  const anchorBounds = focusBounds ?? contextBounds
  const anchorCenterX = (anchorBounds.minX + anchorBounds.maxX) / 2
  const anchorCenterY = (anchorBounds.minY + anchorBounds.maxY) / 2
  return clampViewportToBounds({
    viewport: {
      x:
        frameSize.width * AUTO_FRAME_FOCUS_X_RATIO - anchorCenterX * targetZoom,
      y: frameSize.height / 2 - anchorCenterY * targetZoom,
      zoom: targetZoom,
    },
    frameSize,
    contentBounds,
    minZoom,
    maxZoom,
    padding,
    centerWhenContentFits: false,
  })
}

function areViewportsAlmostEqual(
  left: MindmapViewport,
  right: MindmapViewport,
) {
  return (
    Math.abs(left.x - right.x) < 0.5 &&
    Math.abs(left.y - right.y) < 0.5 &&
    Math.abs(left.zoom - right.zoom) < 0.001
  )
}

export function useMindmapViewportController(
  options: UseMindmapViewportControllerOptions,
) {
  const {
    editingNodeIds,
    autoFrameKey,
    initialViewport,
    nodes,
    minZoom = DEFAULT_MIN_ZOOM,
    maxZoom = DEFAULT_MAX_ZOOM,
    framePaddingPx = DEFAULT_FRAME_PADDING_PX,
  } = options
  const autoFrameSignal = autoFrameKey ?? 0
  const [viewport, setViewport] = useState<MindmapViewport>(
    () => initialViewport,
  )
  const [frameSize, setFrameSize] = useState<Size>({ width: 0, height: 0 })
  const viewportFrameRef = useRef<HTMLDivElement | null>(null)
  const animationFrameIdRef = useRef<number | null>(null)
  const frameStartAtRef = useRef<number>(0)
  const frameStartViewportRef = useRef<MindmapViewport>(initialViewport)
  const frameTargetViewportRef = useRef<MindmapViewport>(initialViewport)

  const contentBounds = useMemo(() => buildContentBounds(nodes), [nodes])
  const nodeBoundsById = useMemo(() => buildBoundsById(nodes), [nodes])
  const editingContextBounds = useMemo(
    () => buildContextBounds(nodeBoundsById, editingNodeIds),
    [nodeBoundsById, editingNodeIds],
  )
  const focusNodeBounds = useMemo(() => {
    const focusNodeId = editingNodeIds[0]
    if (!focusNodeId) {
      return null
    }
    return nodeBoundsById.get(focusNodeId) ?? null
  }, [editingNodeIds, nodeBoundsById])

  const cancelAutoFrame = useCallback(() => {
    if (animationFrameIdRef.current === null || typeof window === "undefined") {
      return
    }
    window.cancelAnimationFrame(animationFrameIdRef.current)
    animationFrameIdRef.current = null
  }, [])

  const clampViewport = useCallback(
    (next: MindmapViewport) =>
      clampViewportToBounds({
        viewport: next,
        frameSize,
        contentBounds,
        minZoom,
        maxZoom,
        padding: framePaddingPx,
      }),
    [contentBounds, framePaddingPx, frameSize, maxZoom, minZoom],
  )

  const onViewportChange = useCallback(
    (next: MindmapViewport, _meta: MindmapViewportChangeMeta) => {
      cancelAutoFrame()
      setViewport(() => clampViewport(next))
    },
    [cancelAutoFrame, clampViewport],
  )

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return
    }
    const frame = viewportFrameRef.current
    if (!frame) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      setFrameSize((current) => {
        const width = Math.round(entry.contentRect.width)
        const height = Math.round(entry.contentRect.height)
        if (current.width === width && current.height === height) {
          return current
        }
        return { width, height }
      })
    })
    observer.observe(frame)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    setViewport((current) => clampViewport(current))
  }, [clampViewport])

  useEffect(() => {
    void autoFrameSignal
    if (!editingContextBounds) {
      return
    }
    setViewport((current) => {
      const measuredFrameSize = readFrameSizeFromElement(
        viewportFrameRef.current,
      )
      const effectiveFrameSize =
        frameSize.width > 0 && frameSize.height > 0
          ? frameSize
          : (measuredFrameSize ?? frameSize)
      if (
        measuredFrameSize &&
        (measuredFrameSize.width !== frameSize.width ||
          measuredFrameSize.height !== frameSize.height)
      ) {
        setFrameSize(measuredFrameSize)
      }
      const target = computeAutoFrameViewport({
        viewport: current,
        frameSize: effectiveFrameSize,
        contextBounds: editingContextBounds,
        focusBounds: focusNodeBounds,
        contentBounds,
        minZoom,
        maxZoom,
        padding: framePaddingPx,
      })
      if (areViewportsAlmostEqual(current, target)) {
        return current
      }
      if (typeof window === "undefined") {
        return target
      }

      cancelAutoFrame()
      frameStartAtRef.current = performance.now()
      frameStartViewportRef.current = current
      frameTargetViewportRef.current = target

      const tick = (timestamp: number) => {
        const duration = Math.max(1, AUTO_FRAME_DURATION_MS)
        const elapsed = timestamp - frameStartAtRef.current
        const progress = clamp(elapsed / duration, 0, 1)
        const eased = easeOutCubic(progress)
        const from = frameStartViewportRef.current
        const to = frameTargetViewportRef.current
        setViewport({
          x: lerp(from.x, to.x, eased),
          y: lerp(from.y, to.y, eased),
          zoom: lerp(from.zoom, to.zoom, eased),
        })

        if (progress >= 1) {
          animationFrameIdRef.current = null
          return
        }
        animationFrameIdRef.current = window.requestAnimationFrame(tick)
      }

      animationFrameIdRef.current = window.requestAnimationFrame(tick)
      return current
    })
  }, [
    cancelAutoFrame,
    contentBounds,
    editingContextBounds,
    focusNodeBounds,
    framePaddingPx,
    frameSize,
    maxZoom,
    minZoom,
    autoFrameSignal,
  ])

  useEffect(() => {
    return () => {
      cancelAutoFrame()
    }
  }, [cancelAutoFrame])

  return {
    viewport,
    viewportFrameRef,
    onViewportChange,
  }
}
