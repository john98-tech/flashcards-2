'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Hand, Minus, Plus } from 'lucide-react'
// HW_ZOOM_PATCH
import { PageBar } from './PageBar'
import { Toolbar } from './Toolbar'
import { CANVAS_HEIGHT, CANVAS_WIDTH, useDrawingEngine, type PageInfo } from './useDrawingEngine'

// Native cursor is hidden site-wide by CursorFx, and its custom ring lives outside the
// fullscreen element (so it is not rendered). Give the cursor back inside the editor.
const FULLSCREEN_CURSOR_CSS = `
html.cursor-fx-on [data-hw-fs='true'],
html.cursor-fx-on [data-hw-fs='true'] * { cursor: default !important; }
html.cursor-fx-on [data-hw-fs='true'] button,
html.cursor-fx-on [data-hw-fs='true'] input[type='range'],
html.cursor-fx-on [data-hw-fs='true'] label { cursor: pointer !important; }
html.cursor-fx-on [data-hw-fs='true'] canvas[data-tool='pen'] { cursor: crosshair !important; }
html.cursor-fx-on [data-hw-fs='true'] canvas[data-tool='eraser'] { cursor: none !important; }
html:has([data-hw-fs='true']) .cursor-ring,
html:has([data-hw-fs='true']) .cursor-dot { display: none !important; }
html.cursor-fx-on [data-hw-fs='true'] [data-hw-pan='idle'] { cursor: grab !important; }
html.cursor-fx-on [data-hw-fs='true'] [data-hw-pan='active'] { cursor: grabbing !important; }
`

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export type HandwritingEditorHandle = {
  exportPages: () => Promise<Blob[]>
  getContentPageIndices: () => number[]
  getGuideLayout: () => { text: string; level: number; page: number; y: number }[]
  hasContent: () => boolean
  reset: () => void
}

type GuideHeadingLayout = { id: string; text: string; level: number; page: number; y: number }

const GUIDE_MIN_GAP = 4.2
const normalizeGuideOrder = (items: GuideHeadingLayout[]): GuideHeadingLayout[] => {
  const ordered = [...items].sort((a, b) => Number(a.id.split(':', 1)[0]) - Number(b.id.split(':', 1)[0]))
  let previous: GuideHeadingLayout | null = null
  return ordered.map((item) => {
    let page = Math.max(0, Math.floor(Number.isFinite(item.page) ? item.page : 0))
    let y = Math.max(7, Math.min(86, Number.isFinite(item.y) ? item.y : 7))
    if (previous) {
      page = Math.max(page, previous.page)
      if (page === previous.page) {
        y = Math.max(y, previous.y + GUIDE_MIN_GAP)
        if (y > 86) { page += 1; y = 7 }
      }
    }
    const next = { ...item, page, y }
    previous = next
    return next
  })
}

type Props = {
  guideHeadings?: { level: number; text: string }[]
  storageKey?: string
  maxPages?: number
  onChange?: (info: PageInfo) => void
  onError?: (message: string) => void
}

export const HandwritingEditor = forwardRef<HandwritingEditorHandle, Props>(function HandwritingEditor(
  { storageKey, maxPages = 10, onChange, onError, guideHeadings = [] },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shadowRef = useRef<HTMLCanvasElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
  const fullscreenActive = isFullscreen || fallbackFullscreen
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null)

  // Fullscreen page size is measured in real pixels (no container-query units / aspect-ratio),
  // so the canvas box - and therefore pointer-to-canvas mapping - is always well defined.
  useLayoutEffect(() => {
    if (!fullscreenActive) {
      setStageSize(null)
      return
    }
    const stage = editorRef.current?.querySelector<HTMLElement>('.hw-stage')
    if (!stage) return
    const measure = () => {
      const style = getComputedStyle(stage)
      const availW = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const availH = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      if (!(availW > 0) || !(availH > 0)) return
      const ratio = CANVAS_WIDTH / CANVAS_HEIGHT
      // Always use the full available width; the sheet gets taller than the screen and is scrolled / panned.
      const w = Math.floor(availW)
      const h = Math.floor(w / ratio)
      setStageSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(stage)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    document.addEventListener('fullscreenchange', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      document.removeEventListener('fullscreenchange', measure)
    }
  }, [fullscreenActive])
  const [errorMessage, setErrorMessage] = useState('')
  const [guideLayout, setGuideLayout] = useState<GuideHeadingLayout[]>([])
  const [guideLayoutReady, setGuideLayoutReady] = useState(false)
  const [draggingHeading, setDraggingHeading] = useState<string | null>(null)
  const guideDragRef = useRef<{ id: string; pointerId: number; startY: number; initialY: number; nextY: number } | null>(null)
  const guideSignature = JSON.stringify(guideHeadings)
  const [confirmAction, setConfirmAction] = useState<'clear' | 'delete' | 'reset-headings' | null>(null)
  const handleEngineError = useCallback((message: string) => {
    setErrorMessage(message)
    onError?.(message)
  }, [onError])
  const {
    pages,
    currentPage,
    tool,
    color,
    colors,
    penSize,
    eraserSize,
    historyState,
    isSwitching,
    isDrawing,
    cursorRef,
    pointerDown,
    pointerMove,
    pointerUp,
    finishStroke,
    cancelStroke,
    handleContextMenu,
    handlePointerLeave,
    setTool,
    setColor,
    setBrushSize,
    undo,
    redo,
    clearPage,
    switchPage,
    addPage,
    deletePage,
    hasContent,
    reset,
    exportPages,
    reportError,
    setRenderScale,
  } = useDrawingEngine(canvasRef, shadowRef, { maxPages, storageKey, onChange, onError: handleEngineError })

  useImperativeHandle(ref, () => ({
    async exportPages() { return exportPages() },
    getContentPageIndices() { return pages.map((page, index) => page.hasContent ? index + 1 : 0).filter(Boolean) },
    getGuideLayout() { return guideLayout.map(({ text, level, page, y }) => ({ text, level, page: page + 1, y })) },
    hasContent,
    reset,
  }), [exportPages, pages, guideLayout, hasContent, reset])

  // Persist a draggable heading layout independently from the student's ink.
  useEffect(() => {
    let saved: GuideHeadingLayout[] = []
    try {
      const raw = storageKey ? localStorage.getItem(storageKey + ':guide-layout-v1') : null
      if (raw) saved = JSON.parse(raw) as GuideHeadingLayout[]
    } catch {}
    const source = JSON.parse(guideSignature) as { level: number; text: string }[]
    setGuideLayout(normalizeGuideOrder(source.map((heading, index) => {
      const id = index + ':' + heading.text
      return saved.find((item) => item.id === id) ?? {
        id, text: heading.text, level: heading.level,
        page: Math.floor(index / 3), y: 7 + (index % 3) * 30,
      }
    })))
    setGuideLayoutReady(true)
  }, [guideSignature, storageKey])

  useEffect(() => {
    if (!guideLayoutReady || !storageKey) return
    try { localStorage.setItem(storageKey + ':guide-layout-v1', JSON.stringify(guideLayout)) } catch {}
  }, [guideLayout, guideLayoutReady, storageKey])

  const resetGuideHeadings = useCallback(() => {
    const source = JSON.parse(guideSignature) as { level: number; text: string }[]
    setGuideLayout(normalizeGuideOrder(source.map((heading, index) => ({
      id: index + ':' + heading.text,
      text: heading.text,
      level: heading.level,
      page: Math.floor(index / 3),
      y: 7 + (index % 3) * 30,
    }))))
  }, [guideSignature])

  const requiredGuidePages = Math.min(maxPages, Math.max(1, guideLayout.reduce((highest, item) => Math.max(highest, item.page + 1), 1)))
  useEffect(() => {
    if (!guideLayoutReady || !guideLayout.length || isSwitching || isDrawing) return
    // Only ensure the initial guide pages exist. Never force the user back to page 1:
    // that would interrupt a heading being moved to the next page.
    if (pages.length < requiredGuidePages) void addPage().catch(reportError)
  }, [guideLayoutReady, guideLayout.length, pages.length, requiredGuidePages, isSwitching, isDrawing, addPage, reportError])

  const guideHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guideHoldPointerRef = useRef<{ id: string; pointerId: number; startY: number; startX: number; initialY: number; nextY: number; target: HTMLElement } | null>(null)

  const clearGuideHold = () => {
    if (guideHoldTimerRef.current) clearTimeout(guideHoldTimerRef.current)
    guideHoldTimerRef.current = null
    guideHoldPointerRef.current = null
  }

  const startGuideHold = (event: ReactPointerEvent<HTMLDivElement>, heading: GuideHeadingLayout) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    const pointerId = event.pointerId
    const startY = event.clientY
    const startX = event.clientX
    guideHoldPointerRef.current = { id: heading.id, pointerId, startY, startX, initialY: heading.y, nextY: heading.y, target }
    // Capture immediately so the browser cannot take over this touch as page scrolling.
    try { target.setPointerCapture(pointerId) } catch {}
    guideHoldTimerRef.current = setTimeout(() => {
      const pending = guideHoldPointerRef.current
      if (!pending || pending.pointerId !== pointerId) return
      guideDragRef.current = { id: heading.id, pointerId, startY, initialY: heading.y, nextY: heading.y }
      setDraggingHeading(heading.id)
    }, 480)
  }

  const moveGuideHold = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pending = guideHoldPointerRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const drag = guideDragRef.current
    if (!drag) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 14) clearGuideHold()
      return
    }
    const height = paperRef.current?.getBoundingClientRect().height || 1
    const y = Math.max(3, Math.min(92, drag.initialY + ((event.clientY - drag.startY) / height) * 100))
    drag.nextY = y
    setGuideLayout((items) => normalizeGuideOrder(items.map((item) => item.id === drag.id ? { ...item, y } : item)))
  }

  const endGuideHold = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pending = guideHoldPointerRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    const drag = guideDragRef.current
    if (!drag) {
      clearGuideHold()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    guideDragRef.current = null
    clearGuideHold()
    setDraggingHeading(null)
    if (drag.nextY < 86) return
    const nextPage = currentPage + 1
    const occupied = new Set(guideLayout.filter((item) => item.page === nextPage && item.id !== drag.id).map((item) => Math.round(item.y)))
    let targetY = [7, 37, 67].find((value) => !occupied.has(value))
    let targetPage = nextPage
    if (targetY === undefined) { targetPage = nextPage + 1; targetY = 7 }
    setGuideLayout((items) => normalizeGuideOrder(items.map((item) => item.id === drag.id ? { ...item, page: targetPage, y: targetY! } : item)))
    // addPage() already switches to the newly inserted page. Do not race it
    // with a second switchPage() call: the drawing engine rejects concurrent switches.
    void (async () => {
      if (pages.length <= targetPage) {
        if (pages.length >= Math.min(10, Math.max(1, Math.floor(maxPages) || 10))) {
          reportError('وصلت إلى الحد الأقصى لعدد الصفحات.')
          return
        }
        await addPage()
      } else {
        await switchPage(targetPage)
      }
    })().catch((error: unknown) => reportError(error))
  }

  // ---------------------------------------------------------------------------
  // Zoom / pan. Only the paper layer is transformed (never the page). The canvas maps pointer
  // positions with getBoundingClientRect(), so CSS transforms need no change to the drawing code.
  // ---------------------------------------------------------------------------
  const viewRef = useRef({ z: 1, x: 0, y: 0 })
  const panRef = useRef<{ id: number; sx: number; sy: number; x: number; y: number } | null>(null)
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [zoomPct, setZoomPct] = useState(100)
  const [badgeVisible, setBadgeVisible] = useState(false)
  const badgeVisibleRef = useRef(false)
  const zoomUiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomPctRef = useRef(100)
  const [panMode, setPanMode] = useState(false)
  const [panning, setPanning] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const flashBadge = useCallback(() => {
    if (!badgeVisibleRef.current) {
      badgeVisibleRef.current = true
      setBadgeVisible(true)
    }
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current)
    badgeTimerRef.current = setTimeout(() => {
      badgeVisibleRef.current = false
      setBadgeVisible(false)
    }, 900)
  }, [])

  useEffect(() => () => {
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current)
    if (zoomUiTimerRef.current) clearTimeout(zoomUiTimerRef.current)
  }, [])

  useEffect(() => () => {
    if (guideHoldTimerRef.current) clearTimeout(guideHoldTimerRef.current)
  }, [])

  // Re-render the vector ink at the real on-screen resolution (debounced) so it never looks pixelated.
  const resolutionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleResolution = useCallback(() => {
    if (resolutionTimerRef.current) clearTimeout(resolutionTimerRef.current)
    resolutionTimerRef.current = setTimeout(() => {
      const paper = paperRef.current
      if (!paper) return
      const width = paper.getBoundingClientRect().width
      const zoom = viewRef.current.z
      if (width > 0) {
        const deviceScale = (width * zoom * (window.devicePixelRatio || 1)) / CANVAS_WIDTH
        setRenderScale(deviceScale)
      }
    }, 160)
  }, [setRenderScale])

  useEffect(() => () => {
    if (resolutionTimerRef.current) clearTimeout(resolutionTimerRef.current)
  }, [])

  const applyView = useCallback((z: number, x: number, y: number) => {
    const stage = stageRef.current
    const paper = paperRef.current
    const zoom = clampZoom(z)
    let nextX = x
    let nextY = y
    if (stage && paper) {
      // Smaller than the viewport: keep centred. Larger: the paper can never leave the viewport.
      const fit = (viewport: number, content: number, base: number, value: number) =>
        content <= viewport
          ? (viewport - content) / 2 - base
          : Math.min(-base, Math.max(viewport - content - base, value))
      nextX = fit(stage.clientWidth, paper.offsetWidth * zoom, paper.offsetLeft, x)
      nextY = fit(stage.clientHeight, paper.offsetHeight * zoom, paper.offsetTop, y)
    }
    const previousZoom = viewRef.current.z
    viewRef.current = { z: zoom, x: nextX, y: nextY }
    if (paper) paper.style.transform = `translate(${nextX}px, ${nextY}px) scale(${zoom})`
    const nextPct = Math.round(zoom * 100)
    // Keep pinch/wheel gestures from re-rendering this large editor on every pointer event.
    // The paper itself is transformed directly; the small zoom label updates at most every 80ms.
    if (nextPct !== zoomPctRef.current && zoomUiTimerRef.current === null) {
      zoomUiTimerRef.current = setTimeout(() => {
        zoomUiTimerRef.current = null
        const latestPct = Math.round(viewRef.current.z * 100)
        zoomPctRef.current = latestPct
        setZoomPct(latestPct)
      }, 80)
    }
    if (Math.abs(zoom - previousZoom) > 0.001) {
      flashBadge()
      // Replay original vector strokes once the gesture settles, not on every pinch frame.
      scheduleResolution()
    }
  }, [flashBadge, scheduleResolution])

  const zoomAt = useCallback((nextZoom: number, clientX: number, clientY: number) => {
    const stage = stageRef.current
    const paper = paperRef.current
    if (!stage || !paper) return
    const view = viewRef.current
    const rect = stage.getBoundingClientRect()
    const originX = rect.left + stage.clientLeft + paper.offsetLeft
    const originY = rect.top + stage.clientTop + paper.offsetTop
    const px = (clientX - originX - view.x) / view.z
    const py = (clientY - originY - view.y) / view.z
    const zoom = clampZoom(nextZoom)
    applyView(zoom, clientX - originX - px * zoom, clientY - originY - py * zoom)
  }, [applyView])

  const zoomByStep = useCallback((factor: number) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    zoomAt(viewRef.current.z * factor, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [zoomAt])

  const resetView = useCallback(() => applyView(1, 0, 0), [applyView])

  // The layout changes when entering / leaving fullscreen: start from a clean 100%.
  useEffect(() => {
    applyView(1, 0, 0)
  }, [fullscreenActive, applyView])

  // Keep the current view valid when the paper or the viewport is resized.
  useEffect(() => {
    const stage = stageRef.current
    const paper = paperRef.current
    if (!stage || !paper || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const view = viewRef.current
      applyView(view.z, view.x, view.y)
      scheduleResolution()
    })
    observer.observe(stage)
    observer.observe(paper)
    return () => observer.disconnect()
  }, [applyView, scheduleResolution])

  // The floating controls stay on screen while the writing sheet is visible, even when the page scrolls.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setControlsVisible(entry.isIntersecting), { threshold: 0.05 })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // Ctrl + wheel (and trackpad pinch) zoom, plus two-finger pinch + pan on touch screens.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        // Sheet taller / wider than the viewport (fullscreen or zoomed): wheel scrolls it.
        const paper = paperRef.current
        const before = viewRef.current
        if (!paper) return
        if (paper.offsetHeight * before.z <= stage.clientHeight + 1 && paper.offsetWidth * before.z <= stage.clientWidth + 1) return
        const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1
        applyView(before.z, before.x - event.deltaX * unit, before.y - event.deltaY * unit)
        const after = viewRef.current
        if (after.x !== before.x || after.y !== before.y) event.preventDefault()
        return
      }
      event.preventDefault()
      const raw = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY
      const delta = Math.max(-120, Math.min(120, raw))
      zoomAt(viewRef.current.z * Math.exp(-delta * 0.0015), event.clientX, event.clientY)
    }

    const touches = new Map<number, { x: number; y: number }>()
    let penDown = false
    let pinch: { dist: number; zoom: number; px: number; py: number; ox: number; oy: number } | null = null

    const pair = () => {
      const [a, b] = Array.from(touches.values())
      return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }

    const startPinch = () => {
      const paper = paperRef.current
      if (!paper || touches.size < 2) {
        pinch = null
        return
      }
      const { dist, mx, my } = pair()
      const rect = stage.getBoundingClientRect()
      const ox = rect.left + stage.clientLeft + paper.offsetLeft
      const oy = rect.top + stage.clientTop + paper.offsetTop
      const view = viewRef.current
      pinch = { dist, zoom: view.z, px: (mx - ox - view.x) / view.z, py: (my - oy - view.y) / view.z, ox, oy }
    }

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'pen') {
        penDown = true
        return
      }
      if (event.pointerType !== 'touch' || penDown) return
      if (event.isPrimary) touches.clear()
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches.size < 2) return
      // Second finger: this is a gesture, not writing. Drop the accidental dot and block the canvas.
      event.stopPropagation()
      event.preventDefault()
      if (!pinch) {
        cancelStroke()
        panRef.current = null
        setPanning(false)
        startPinch()
      }
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (!pinch || touches.size < 2) return
      event.stopPropagation()
      event.preventDefault()
      const { dist, mx, my } = pair()
      const zoom = clampZoom(pinch.zoom * (dist / pinch.dist))
      applyView(zoom, mx - pinch.ox - pinch.px * zoom, my - pinch.oy - pinch.py * zoom)
    }

    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'pen') {
        penDown = false
        return
      }
      if (event.pointerType !== 'touch') return
      const wasPinching = pinch !== null
      touches.delete(event.pointerId)
      if (wasPinching) {
        if (touches.size >= 2) startPinch()
        else pinch = null
      }
    }

    const preventGesture = (event: Event) => event.preventDefault()

    stage.addEventListener('wheel', onWheel, { passive: false })
    stage.addEventListener('pointerdown', onDown, { capture: true })
    stage.addEventListener('pointermove', onMove, { capture: true })
    stage.addEventListener('pointerup', onUp, { capture: true })
    stage.addEventListener('pointercancel', onUp, { capture: true })
    stage.addEventListener('gesturestart', preventGesture)
    stage.addEventListener('gesturechange', preventGesture)
    return () => {
      stage.removeEventListener('wheel', onWheel)
      stage.removeEventListener('pointerdown', onDown, { capture: true })
      stage.removeEventListener('pointermove', onMove, { capture: true })
      stage.removeEventListener('pointerup', onUp, { capture: true })
      stage.removeEventListener('pointercancel', onUp, { capture: true })
      stage.removeEventListener('gesturestart', preventGesture)
      stage.removeEventListener('gesturechange', preventGesture)
    }
  }, [applyView, cancelStroke, zoomAt])

  // Hand tool: drag anywhere on the sheet to move it.
  const onPanDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is only a convenience here.
    }
    const view = viewRef.current
    panRef.current = { id: event.pointerId, sx: event.clientX, sy: event.clientY, x: view.x, y: view.y }
    setPanning(true)
  }
  const onPanMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || pan.id !== event.pointerId) return
    applyView(viewRef.current.z, pan.x + event.clientX - pan.sx, pan.y + event.clientY - pan.sy)
  }
  const onPanEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.id !== event.pointerId) return
    panRef.current = null
    setPanning(false)
  }

  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement === editorRef.current
      setIsFullscreen(active)
      if (active) setFallbackFullscreen(false)
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    if (!fallbackFullscreen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFallbackFullscreen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [fallbackFullscreen])

  const toggleFullscreen = useCallback(async () => {
    const element = editorRef.current
    if (!element) return
    if (fallbackFullscreen) {
      setFallbackFullscreen(false)
      return
    }
    if (document.fullscreenElement === element) {
      await document.exitFullscreen()
      return
    }
    if (element.requestFullscreen) {
      try {
        await element.requestFullscreen()
        return
      } catch {
        setFallbackFullscreen(true)
        return
      }
    }
    setFallbackFullscreen(true)
  }, [fallbackFullscreen])

  const runPageAction = useCallback((action: () => Promise<void>) => {
    void action().catch((error: unknown) => reportError(error))
  }, [reportError])

  const removeCurrentPage = useCallback(async () => {
    // With a single page, the engine clears its writing instead of deleting
    // the page. Keep its headings in place in that case.
    if (pages.length <= 1) {
      await deletePage()
      return
    }

    const removedPageIndex = currentPage
    await deletePage()
    // Remove headings belonging to the deleted page and shift later headings
    // so the guide-page requirement does not silently recreate the deleted page.
    setGuideLayout((items) => normalizeGuideOrder(
      items
        .filter((item) => item.page !== removedPageIndex)
        .map((item) => item.page > removedPageIndex ? { ...item, page: item.page - 1 } : item)
    ))
  }, [currentPage, deletePage, pages.length])

  const askConfirm = useCallback((action: 'clear' | 'delete') => {
    if (!pages[currentPage]?.hasContent) {
      if (action === 'delete' && pages.length > 1) runPageAction(removeCurrentPage)
      return
    }
    setConfirmAction(action)
  }, [pages, currentPage, removeCurrentPage, runPageAction])

  const runConfirmed = () => {
    const action = confirmAction
    setConfirmAction(null)
    if (action === 'clear') clearPage()
    else if (action === 'delete') runPageAction(removeCurrentPage)
    else if (action === 'reset-headings') resetGuideHeadings()
  }

  const confirmMessage = confirmAction === 'reset-headings'
    ? 'ترجع كل العناوين لترتيبها ومكانها الأصلي؟ الكتابة الموجودة في الصفحات هتفضل زي ما هي.'
    : confirmAction === 'delete' && pages.length > 1
      ? 'تحذف الصفحة ' + (currentPage + 1) + ' وكل ما فيها؟'
      : 'تمسح كل ما كتبته في الصفحة الحالية؟ يمكنك التراجع عن المسح.'

  const editorClass = fullscreenActive
    ? 'fixed inset-0 z-[100] flex h-dvh w-screen flex-col overflow-hidden bg-slate-100 p-2 sm:p-4'
    : 'mx-auto w-[94%] max-w-[1600px] space-y-3 touch-pan-y'
  const fullscreenContentClass = fullscreenActive
    ? 'mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col gap-2'
    : 'space-y-3'

  return (
    <div ref={editorRef} className={editorClass} dir="rtl" data-handwriting-editor data-hw-fs={fullscreenActive ? 'true' : 'false'}>
      <div className={fullscreenContentClass}>
        <Toolbar
          tool={tool}
          color={color}
          colors={colors}
          size={tool === 'pen' ? penSize : eraserSize}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          isBusy={isSwitching || isDrawing}
          isFullscreen={fullscreenActive}
          onToolChange={(next) => {
            setPanMode(false)
            setTool(next)
          }}
          onColorChange={setColor}
          onSizeChange={setBrushSize}
          onUndo={undo}
          onRedo={redo}
          onClear={() => askConfirm('clear')}
          onResetHeadings={() => setConfirmAction('reset-headings')}
          onFullscreen={() => void toggleFullscreen().catch((error: unknown) => reportError(error))}
        />

        <div className={fullscreenActive ? 'flex min-h-0 flex-1 flex-col gap-2' : 'space-y-3'}>
          <PageBar
            currentPage={currentPage}
            pageCount={pages.length}
            maxPages={Math.max(1, Math.min(10, Math.floor(maxPages) || 10))}
            isBusy={isSwitching || isDrawing}
            onPrevious={() => runPageAction(() => switchPage(currentPage - 1))}
            onNext={() => runPageAction(() => switchPage(currentPage + 1))}
            onAdd={() => runPageAction(addPage)}
            onDelete={() => askConfirm('delete')}
          />

          <div className={fullscreenActive
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-42px_rgba(15,23,42,0.45)]'
            : 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-42px_rgba(15,23,42,0.45)]'
          }>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <div>
                <p className="text-sm font-bold text-slate-800">دفتر الإجابة</p>
                <p className="text-xs text-slate-500">اكتب إجابتك بخط واضح داخل المساحة</p>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                {pages[currentPage]?.hasContent ? 'فيها كتابة' : 'صفحة فارغة'}
              </span>
            </div>
            <div
              ref={stageRef}
              className={fullscreenActive
                ? 'hw-stage relative min-h-0 flex-1 touch-pan-y overflow-hidden bg-slate-100 p-2'
                : 'relative aspect-[5/7] w-full touch-pan-y overflow-hidden bg-slate-100'
              }
            >
              <div
                ref={paperRef}
                className={fullscreenActive
                  ? 'absolute inset-0 m-auto overflow-hidden bg-white shadow-[0_12px_40px_-16px_rgba(15,23,42,0.3)]'
                  : 'absolute inset-0 overflow-hidden bg-white shadow-[0_2px_12px_-8px_rgba(15,23,42,0.18)]'
                }
                style={{
                  transformOrigin: '0 0',
                  ...(fullscreenActive ? { width: stageSize ? stageSize.w : 0, height: stageSize ? stageSize.h : 0 } : {}),
                  backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent calc(100% - 1px), #e2eaf2 calc(100% - 1px), #e2eaf2 100%)',
                  backgroundSize: `100% ${(40 / CANVAS_HEIGHT) * 100}%`,
                }}
                onContextMenu={handleContextMenu}
              >
                {guideLayoutReady && guideLayout.filter((heading) => heading.page === currentPage).map((heading) => (
                  <div
                    key={heading.id}
                    dir="auto"
                    className={`pointer-events-none absolute left-[2%] z-20 inline-flex h-[3.2%] w-fit max-w-[96%] min-w-0 select-none items-center rounded-md border border-teal-300/80 bg-white/55 px-2 text-left shadow-[0_1px_4px_-2px_rgba(15,118,110,.12)] ${heading.level <= 2 ? 'bg-teal-50/65 font-bold text-slate-900' : 'font-semibold text-slate-800'}`}
                    style={{ top: `${heading.y}%`, fontSize: 'clamp(10px, 1.35vw, 13px)', lineHeight: 1, paddingInlineStart: heading.level >= 4 ? '1.5rem' : '0.5rem', touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
                    aria-label={`عنوان إرشادي: ${heading.text}`}
                  >
                    <span className="min-w-0 max-w-full whitespace-nowrap leading-none">{heading.text}</span>
                  </div>
                ))}
                {draggingHeading && guideLayout.some((heading) => heading.id === draggingHeading && heading.y >= 86) && (
                  <div className="pointer-events-none absolute inset-x-[4%] bottom-[1.5%] z-30 flex h-[10%] items-center justify-center rounded-2xl border border-teal-300/80 bg-white/65 px-3 text-center text-xs font-bold text-teal-900 shadow-[0_8px_35px_-12px_rgba(15,118,15,.45)] backdrop-blur-xl">
                    اسحب هنا لنقل العنوان إلى الصفحة التالية
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerCancel={(event) => finishStroke(event.pointerId)}
                  onLostPointerCapture={(event) => finishStroke(event.pointerId)}
                  onPointerLeave={handlePointerLeave}
                  onContextMenu={handleContextMenu}
                  className={`absolute inset-0 h-full w-full touch-none select-none ${tool === 'eraser' ? 'cursor-none' : 'cursor-crosshair'}`}
                  style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                  aria-label="مساحة كتابة الإجابة"
                  data-tool={tool}
                />
              </div>
              <div
                ref={cursorRef}
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 z-10 rounded-full border border-slate-500/70 bg-slate-400/25 opacity-0"
              />
              {panMode && (
                <div
                  data-hw-pan={panning ? 'active' : 'idle'}
                  onPointerDown={onPanDown}
                  onPointerMove={onPanMove}
                  onPointerUp={onPanEnd}
                  onPointerCancel={onPanEnd}
                  onContextMenu={handleContextMenu}
                  className={`absolute inset-0 z-20 touch-none select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{ touchAction: 'none' }}
                  aria-label="تحريك الورقة"
                />
              )}
              <div
                aria-hidden
                dir="ltr"
                className={`pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-slate-900/80 px-6 py-2.5 text-3xl font-extrabold tabular-nums tracking-tight text-white shadow-2xl ring-1 ring-white/20 backdrop-blur transition-all duration-200 ${badgeVisible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}
              >
                {zoomPct}%
              </div>
            </div>
          </div>
          <p className={`${fullscreenActive ? 'hidden' : ''} px-1 text-center text-xs text-slate-500`}>
            التراجع والإعادة متاحان لآخر 10 خطوات في كل صفحة
          </p>
        </div>
      </div>
      {controlsVisible && (
        <div
          dir="ltr"
          role="group"
          aria-label="التحكم في الورقة"
          className="fixed bottom-3 left-1/2 z-[105] flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-slate-200/80 bg-white/95 p-1 shadow-[0_12px_36px_-18px_rgba(15,23,42,0.5)] backdrop-blur"
        >
          <button
            type="button"
            onClick={() => setPanMode((value) => !value)}
            aria-pressed={panMode}
            aria-label="تحريك الورقة"
            title="تحريك الورقة (اسحب في أي مكان)"
            className={`inline-flex size-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${panMode ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-transparent text-slate-700 hover:bg-slate-100'}`}
          >
            <Hand className="size-[18px]" aria-hidden />
          </button>
          <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />
          <button
            type="button"
            onClick={() => zoomByStep(1 / ZOOM_STEP)}
            disabled={zoomPct <= MIN_ZOOM * 100}
            aria-label="تصغير"
            title="تصغير"
            className="inline-flex size-10 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
          >
            <Minus className="size-[15px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={resetView}
            aria-label="إعادة الحجم إلى 100%"
            title="إعادة الحجم إلى 100%"
            className="inline-flex h-10 min-w-14 items-center justify-center rounded-lg px-1.5 text-[13px] font-bold tabular-nums text-slate-800 transition-colors hover:bg-slate-100"
          >
            {zoomPct}%
          </button>
          <button
            type="button"
            onClick={() => zoomByStep(ZOOM_STEP)}
            disabled={zoomPct >= MAX_ZOOM * 100}
            aria-label="تكبير"
            title="تكبير"
            className="inline-flex size-10 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {errorMessage && (
        <div role="alert" className="fixed inset-x-3 bottom-3 z-[120] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 shadow-lg">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage('')} className="shrink-0 rounded-lg px-2 py-1 font-semibold hover:bg-rose-100">إغلاق</button>
        </div>
      )}
      {confirmAction && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold leading-7 text-slate-800">{confirmMessage}</p>
            <div className="flex gap-2">
              <button type="button" onClick={runConfirmed} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700">تأكيد</button>
              <button type="button" onClick={() => setConfirmAction(null)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
      <style>{FULLSCREEN_CURSOR_CSS}</style>
      <canvas ref={shadowRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden" aria-hidden />
    </div>
  )
})
