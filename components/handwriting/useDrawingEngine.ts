'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

// Logical page size. Strokes are stored in these units (vector data); the <canvas> backing store
// is re-rendered from the strokes at whatever resolution the screen / zoom needs, so ink stays sharp.
export const CANVAS_WIDTH = 1000
export const CANVAS_HEIGHT = 1400
const MAX_HISTORY = 10
const MIN_RENDER_SCALE = 1
// 3.25 -> 3250 x 4550 px (~14.8M px): safely under the iOS / mobile canvas area limit.
const MAX_RENDER_SCALE = 3.25

export type DrawingTool = 'pen' | 'eraser'

type Point = { x: number; y: number; pressure: number }
type StrokeData = { tool: DrawingTool; color: string; size: number; points: Point[] }

export type DrawingPage = {
  id: number
  blob: Blob | null
  hasContent: boolean
  strokes: StrokeData[]
  // History keeps whole (immutable) stroke lists, so undo / redo is just swapping arrays.
  undoStack: StrokeData[][]
  redoStack: StrokeData[][]
}
export type PageInfo = { pageCount: number; hasContent: boolean }
export type DrawingEngineOptions = {
  maxPages: number
  storageKey?: string
  onChange?: (info: PageInfo) => void
  onError?: (message: string) => void
}

type ActiveStroke = {
  pointerId: number
  data: StrokeData
  last: Point
  lastMidpoint: Point
}

const COLORS = ['#171717', '#2563eb', '#dc2626', '#15803d']
const makePage = (id: number): DrawingPage => ({
  id,
  blob: null,
  hasContent: false,
  strokes: [],
  undoStack: [],
  redoStack: [],
})

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('تعذر حفظ صفحة الكتابة كصورة.'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

// Pointer position -> logical page coordinates (independent of the canvas backing resolution).
function pointFromEvent(event: PointerEvent, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect()
  const pressure = event.pointerType === 'pen' && event.pressure > 0
    ? Math.max(0.75, Math.min(1.25, 0.85 + event.pressure * 0.3))
    : 1
  return {
    x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * CANVAS_HEIGHT,
    pressure,
  }
}

// getCoalescedEvents() can return an empty array (Safari/iOS, some Chrome/Firefox builds).
// Without a fallback no line is ever drawn - only the dot from pointerdown.
function coalescedEventsOf(event: PointerEvent): PointerEvent[] {
  const list = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
  return list.length > 0 ? list : [event]
}

// ---------------------------------------------------------------------------
// Stroke painting. The same three functions are used for live drawing and for replaying the
// stored strokes, so a re-render at a new resolution looks identical to what the student drew.
// ---------------------------------------------------------------------------
function paintDot(context: CanvasRenderingContext2D, stroke: StrokeData, point: Point) {
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  context.fillStyle = stroke.color
  context.beginPath()
  context.arc(point.x, point.y, (stroke.size * point.pressure) / 2, 0, Math.PI * 2)
  context.fill()
  context.globalCompositeOperation = 'source-over'
}

function paintSegment(context: CanvasRenderingContext2D, stroke: StrokeData, last: Point, lastMidpoint: Point, point: Point): Point {
  const middleX = (last.x + point.x) / 2
  const middleY = (last.y + point.y) / 2
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  context.strokeStyle = stroke.color
  context.lineWidth = stroke.size * point.pressure
  context.beginPath()
  context.moveTo(lastMidpoint.x, lastMidpoint.y)
  context.quadraticCurveTo(last.x, last.y, middleX, middleY)
  context.stroke()
  context.globalCompositeOperation = 'source-over'
  return { x: middleX, y: middleY, pressure: point.pressure }
}

function paintEnd(context: CanvasRenderingContext2D, stroke: StrokeData, last: Point, lastMidpoint: Point) {
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  context.strokeStyle = stroke.color
  context.lineWidth = stroke.size * last.pressure
  context.beginPath()
  context.moveTo(lastMidpoint.x, lastMidpoint.y)
  context.quadraticCurveTo(last.x, last.y, last.x, last.y)
  context.stroke()
  context.globalCompositeOperation = 'source-over'
}

function replayStrokes(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, strokes: StrokeData[]) {
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.setTransform(canvas.width / CANVAS_WIDTH, 0, 0, canvas.height / CANVAS_HEIGHT, 0, 0)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const stroke of strokes) {
    const points = stroke.points
    if (points.length === 0) continue
    paintDot(context, stroke, points[0])
    let last = points[0]
    let lastMidpoint = points[0]
    for (let index = 1; index < points.length; index++) {
      lastMidpoint = paintSegment(context, stroke, last, lastMidpoint, points[index])
      last = points[index]
    }
    paintEnd(context, stroke, last, lastMidpoint)
  }
}

// A page "has content" when some pen ink survives the eraser. Only erased pages need the
// (small, half-size) pixel check.
function pageHasInk(page: DrawingPage) {
  if (!page.strokes.some((stroke) => stroke.tool === 'pen')) return false
  if (!page.strokes.some((stroke) => stroke.tool === 'eraser')) return true
  const probe = document.createElement('canvas')
  probe.width = CANVAS_WIDTH / 2
  probe.height = CANVAS_HEIGHT / 2
  const context = probe.getContext('2d', { willReadFrequently: true })
  if (!context) return true
  replayStrokes(context, probe, page.strokes)
  const { data } = context.getImageData(0, 0, probe.width, probe.height)
  probe.width = 0
  probe.height = 0
  for (let pixel = 3; pixel < data.length; pixel += 4) {
    if (data[pixel] > 8) return true
  }
  return false
}

export function useDrawingEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  shadowRef: RefObject<HTMLCanvasElement | null>,
  { maxPages, storageKey, onChange, onError }: DrawingEngineOptions,
) {
  const pagesRef = useRef<DrawingPage[]>([makePage(0)])
  const currentPageRef = useRef(0)
  const nextPageIdRef = useRef(1)
  const operationIdRef = useRef(0)
  const onChangeRef = useRef(onChange)
  const onErrorRef = useRef(onError)
  const strokeRef = useRef<ActiveStroke | null>(null)
  const penActiveRef = useRef(false)
  const pendingPointsRef = useRef<Point[]>([])
  const animationRef = useRef<number | null>(null)
  const switchingRef = useRef(false)
  const canvasDisposedRef = useRef(false)
  const fallbackPointerIdRef = useRef<number | null>(null)
  const fallbackListenersRef = useRef<(() => void) | null>(null)
  const renderScaleRef = useRef(MIN_RENDER_SCALE)
  const pendingScaleRef = useRef<number | null>(null)
  const toolRef = useRef<DrawingTool>('pen')
  const colorRef = useRef(COLORS[0])
  const penSizeRef = useRef(5)
  const eraserSizeRef = useRef(34)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const [pages, setPages] = useState([{ id: 0, hasContent: false }])
  const [currentPage, setCurrentPage] = useState(0)
  const [tool, setTool] = useState<DrawingTool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [penSize, setPenSize] = useState(5)
  const [eraserSize, setEraserSize] = useState(34)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [isSwitching, setIsSwitching] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const effectiveMaxPages = Math.max(1, Math.min(10, Math.floor(maxPages) || 10))

  onChangeRef.current = onChange
  onErrorRef.current = onError
  // Keep current values in refs so draft persistence stays referentially stable.
  // Otherwise changing the tool/color/size re-creates persistDraft -> updatePageList ->
  // the canvas initialization effect, whose cleanup clears the active drawing surface.
  toolRef.current = tool
  colorRef.current = color
  penSizeRef.current = penSize
  eraserSizeRef.current = eraserSize

  const persistDraft = useCallback(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        version: 1,
        currentPage: currentPageRef.current,
        nextPageId: nextPageIdRef.current,
        pages: pagesRef.current.map(({ id, strokes }) => ({ id, strokes })),
        tool: toolRef.current,
        color: colorRef.current,
        penSize: penSizeRef.current,
        eraserSize: eraserSizeRef.current,
      }))
    } catch (error) {
      console.error('Unable to save the handwriting draft.', error)
    }
  }, [storageKey])

  const reportError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'تعذر إكمال عملية الكتابة.'
    console.error('Unable to update the handwriting editor.', error)
    onErrorRef.current?.(message)
  }, [])

  // Sizes the backing store to CANVAS * renderScale and keeps the logical 1000x1400 coordinate system.
  const initializeCanvases = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) throw new Error('تعذر تجهيز مساحة الكتابة.')
    const scale = renderScaleRef.current
    const width = Math.round(CANVAS_WIDTH * scale)
    const height = Math.round(CANVAS_HEIGHT * scale)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const context = canvas.getContext('2d')
    if (!context) throw new Error('متصفحك لا يدعم مساحة الكتابة.')
    context.setTransform(width / CANVAS_WIDTH, 0, 0, height / CANVAS_HEIGHT, 0, 0)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    canvasDisposedRef.current = false
    return { canvas, context }
  }, [canvasRef])

  const redraw = useCallback(() => {
    const { canvas, context } = initializeCanvases()
    const page = pagesRef.current[currentPageRef.current]
    replayStrokes(context, canvas, page ? page.strokes : [])
  }, [initializeCanvases])

  // Called by the editor (debounced) when the on-screen size of the sheet changes: zoom, resize,
  // fullscreen. Re-renders the vector strokes at the new resolution so nothing looks pixelated.
  const setRenderScale = useCallback((requested: number) => {
    if (!Number.isFinite(requested)) return
    const next = Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, Math.ceil(requested * 4) / 4))
    if (strokeRef.current) {
      pendingScaleRef.current = next
      return
    }
    if (next === renderScaleRef.current) return
    renderScaleRef.current = next
    try {
      redraw()
    } catch (error) {
      reportError(error)
    }
  }, [redraw, reportError])

  const updatePageList = useCallback(() => {
    const currentPages = pagesRef.current
    setPages(currentPages.map(({ id, hasContent }) => ({ id, hasContent })))
    persistDraft()
    onChangeRef.current?.({
      pageCount: currentPages.length,
      hasContent: currentPages.some((page) => page.hasContent),
    })
  }, [persistDraft])

  const updateContentState = useCallback((pageIndex: number, hasContent: boolean) => {
    const page = pagesRef.current[pageIndex]
    if (!page || page.hasContent === hasContent) return
    page.hasContent = hasContent
    if (!hasContent) page.blob = null
    updatePageList()
  }, [updatePageList])

  const syncHistoryState = useCallback(() => {
    const page = pagesRef.current[currentPageRef.current]
    setHistoryState({
      canUndo: !!page?.undoStack.length,
      canRedo: !!page?.redoStack.length,
    })
  }, [])

  const processPoint = useCallback((point: Point, stroke: ActiveStroke) => {
    const { context } = initializeCanvases()
    stroke.lastMidpoint = paintSegment(context, stroke.data, stroke.last, stroke.lastMidpoint, point)
    stroke.data.points.push(point)
    stroke.last = point
  }, [initializeCanvases])

  const drawPendingPoints = useCallback(() => {
    animationRef.current = null
    const stroke = strokeRef.current
    const points = pendingPointsRef.current.splice(0)
    if (!stroke) return
    for (const point of points) processPoint(point, stroke)
  }, [processPoint])

  const schedulePoints = useCallback((points: Point[]) => {
    pendingPointsRef.current.push(...points)
    if (animationRef.current === null) {
      animationRef.current = requestAnimationFrame(drawPendingPoints)
    }
  }, [drawPendingPoints])

  const releaseStroke = useCallback(() => {
    strokeRef.current = null
    pendingPointsRef.current.length = 0
    penActiveRef.current = false
    fallbackPointerIdRef.current = null
    fallbackListenersRef.current?.()
    fallbackListenersRef.current = null
    setIsDrawing(false)
    const pending = pendingScaleRef.current
    if (pending !== null) {
      pendingScaleRef.current = null
      setRenderScale(pending)
    }
  }, [setRenderScale])

  const finishStroke = useCallback((pointerId?: number) => {
    const stroke = strokeRef.current
    if (!stroke || (pointerId !== undefined && stroke.pointerId !== pointerId)) return
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    drawPendingPoints()
    try {
      const { context } = initializeCanvases()
      paintEnd(context, stroke.data, stroke.last, stroke.lastMidpoint)
      const index = currentPageRef.current
      const page = pagesRef.current[index]
      if (page) {
        page.undoStack.push(page.strokes)
        if (page.undoStack.length > MAX_HISTORY) page.undoStack.shift()
        page.redoStack.length = 0
        page.strokes = [...page.strokes, stroke.data]
        updateContentState(index, pageHasInk(page))
        syncHistoryState()
        persistDraft()
      }
    } catch (error) {
      reportError(error)
    }
    releaseStroke()
  }, [drawPendingPoints, initializeCanvases, releaseStroke, reportError, syncHistoryState, updateContentState, persistDraft])

  // Aborts the stroke in progress without saving it (a second finger landed, so the gesture is
  // a pinch / pan, not writing). Strokes are only committed on finish, so a repaint is enough.
  const cancelStroke = useCallback(() => {
    const stroke = strokeRef.current
    if (!stroke) return
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    pendingPointsRef.current.length = 0
    strokeRef.current = null
    try {
      redraw()
    } catch (error) {
      reportError(error)
    }
    releaseStroke()
  }, [redraw, releaseStroke, reportError])

  const pointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || switchingRef.current) return
    if (event.pointerType === 'touch' && penActiveRef.current && strokeRef.current) return
    if (strokeRef.current) {
      // A new pointerdown means the previous stroke's pointerup was lost (a mouse always
      // reuses pointerId 1), so close it instead of ignoring every later press.
      try {
        finishStroke(strokeRef.current.pointerId)
      } catch (error) {
        reportError(error)
      }
      strokeRef.current = null
      pendingPointsRef.current.length = 0
      penActiveRef.current = false
      setIsDrawing(false)
    }
    if (event.pointerType === 'pen') penActiveRef.current = true
    event.preventDefault()
    const { canvas, context } = initializeCanvases()
    const point = pointFromEvent(event.nativeEvent, canvas)
    const activeTool = tool
    const size = activeTool === 'eraser' ? eraserSizeRef.current : penSizeRef.current
    const data: StrokeData = {
      tool: activeTool,
      color: activeTool === 'eraser' ? '#000000' : colorRef.current,
      size,
      points: [point],
    }
    strokeRef.current = { pointerId: event.pointerId, data, last: point, lastMidpoint: point }
    paintDot(context, data, point)
    setIsDrawing(true)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      const pointerId = event.pointerId
      const target = event.currentTarget
      fallbackPointerIdRef.current = pointerId
      const onMove = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return
        const coalesced = coalescedEventsOf(nativeEvent)
        schedulePoints(coalesced.map((item) => pointFromEvent(item, target)))
      }
      const onEnd = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return
        if (nativeEvent.type === 'pointerup') {
          schedulePoints([pointFromEvent(nativeEvent, target)])
        }
        finishStroke(pointerId)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
      fallbackListenersRef.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
      }
    }
  }, [finishStroke, initializeCanvases, reportError, schedulePoints, tool])

  const pointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (fallbackPointerIdRef.current === event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (cursorRef.current && tool === 'eraser' && event.pointerType !== 'touch') {
      const scale = rect.width / CANVAS_WIDTH
      const diameter = eraserSizeRef.current * scale
      cursorRef.current.style.width = diameter + 'px'
      cursorRef.current.style.height = diameter + 'px'
      // The cursor ring lives outside the zoomed paper layer, so position it against its own host.
      const host = (cursorRef.current.parentElement ?? event.currentTarget).getBoundingClientRect()
      cursorRef.current.style.transform = 'translate(' + (event.clientX - host.left - diameter / 2) + 'px, ' + (event.clientY - host.top - diameter / 2) + 'px)'
      cursorRef.current.style.opacity = '1'
    }
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    event.preventDefault()
    const nativeEvent = event.nativeEvent
    const coalesced = coalescedEventsOf(nativeEvent)
    schedulePoints(coalesced.map((item) => pointFromEvent(item, event.currentTarget)))
  }, [schedulePoints, tool])

  const pointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (fallbackPointerIdRef.current === event.pointerId) return
    if (strokeRef.current?.pointerId === event.pointerId) {
      schedulePoints([pointFromEvent(event.nativeEvent, event.currentTarget)])
    }
    finishStroke(event.pointerId)
  }, [finishStroke, schedulePoints])

  const setCurrentTool = useCallback((nextTool: DrawingTool) => {
    toolRef.current = nextTool
    setTool(nextTool)
    persistDraft()
  }, [persistDraft])

  const changePenColor = useCallback((nextColor: string) => {
    if (!COLORS.includes(nextColor)) return
    colorRef.current = nextColor
    setColor(nextColor)
    persistDraft()
  }, [persistDraft])

  const changeBrushSize = useCallback((size: number) => {
    if (!Number.isFinite(size)) return
    if (toolRef.current === 'pen') {
      const next = Math.max(2, Math.min(22, size))
      penSizeRef.current = next
      setPenSize(next)
    } else {
      const next = Math.max(12, Math.min(96, size))
      eraserSizeRef.current = next
      setEraserSize(next)
    }
    persistDraft()
  }, [persistDraft])

  const applyHistory = useCallback((direction: 'undo' | 'redo') => {
    if (strokeRef.current || switchingRef.current) return
    const index = currentPageRef.current
    const page = pagesRef.current[index]
    if (!page) return
    const source = direction === 'undo' ? page.undoStack : page.redoStack
    const destination = direction === 'undo' ? page.redoStack : page.undoStack
    const snapshot = source.pop()
    if (!snapshot) return
    destination.push(page.strokes)
    if (destination.length > MAX_HISTORY) destination.shift()
    page.strokes = snapshot
    try {
      redraw()
      updateContentState(index, pageHasInk(page))
    } catch (error) {
      reportError(error)
    }
    syncHistoryState()
    persistDraft()
  }, [redraw, reportError, syncHistoryState, updateContentState, persistDraft])

  const undo = useCallback(() => applyHistory('undo'), [applyHistory])
  const redo = useCallback(() => applyHistory('redo'), [applyHistory])

  const clearPage = useCallback(() => {
    if (strokeRef.current || switchingRef.current) return
    try {
      const index = currentPageRef.current
      const page = pagesRef.current[index]
      if (!page) return
      page.undoStack.push(page.strokes)
      if (page.undoStack.length > MAX_HISTORY) page.undoStack.shift()
      page.redoStack.length = 0
      page.strokes = []
      page.blob = null
      redraw()
      updateContentState(index, false)
      syncHistoryState()
      persistDraft()
    } catch (error) {
      reportError(error)
    }
  }, [redraw, reportError, syncHistoryState, updateContentState, persistDraft])

  const switchPage = useCallback(async (nextIndex: number) => {
    if (
      nextIndex < 0 ||
      nextIndex >= pagesRef.current.length ||
      nextIndex === currentPageRef.current ||
      switchingRef.current ||
      strokeRef.current
    ) return
    switchingRef.current = true
    setIsSwitching(true)
    try {
      currentPageRef.current = nextIndex
      setCurrentPage(nextIndex)
      redraw()
      syncHistoryState()
      persistDraft()
    } catch (error) {
      reportError(error)
    } finally {
      switchingRef.current = false
      setIsSwitching(false)
    }
  }, [redraw, reportError, syncHistoryState, persistDraft])

  const addPage = useCallback(async () => {
    if (pagesRef.current.length >= effectiveMaxPages || switchingRef.current || strokeRef.current) return
    const page = makePage(nextPageIdRef.current++)
    pagesRef.current.splice(currentPageRef.current + 1, 0, page)
    updatePageList()
    await switchPage(currentPageRef.current + 1)
  }, [effectiveMaxPages, switchPage, updatePageList])

  const deletePage = useCallback(async () => {
    if (switchingRef.current || strokeRef.current) return
    const current = currentPageRef.current
    if (pagesRef.current.length === 1) {
      clearPage()
      return
    }
    switchingRef.current = true
    setIsSwitching(true)
    try {
      const nextIndex = Math.min(current, pagesRef.current.length - 2)
      const removed = pagesRef.current.splice(current, 1)[0]
      if (removed) {
        removed.blob = null
        removed.strokes = []
        removed.undoStack.length = 0
        removed.redoStack.length = 0
      }
      currentPageRef.current = nextIndex
      setCurrentPage(nextIndex)
      redraw()
      updatePageList()
      syncHistoryState()
    } catch (error) {
      reportError(error)
    } finally {
      switchingRef.current = false
      setIsSwitching(false)
    }
  }, [clearPage, redraw, reportError, syncHistoryState, updatePageList])

  const hasContent = useCallback(() => pagesRef.current.some((page) => page.hasContent), [])

  const reset = useCallback(() => {
    operationIdRef.current += 1
    switchingRef.current = false
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    strokeRef.current = null
    pendingPointsRef.current.length = 0
    pendingScaleRef.current = null
    fallbackPointerIdRef.current = null
    fallbackListenersRef.current?.()
    fallbackListenersRef.current = null
    penActiveRef.current = false
    setIsDrawing(false)
    setIsSwitching(false)
    for (const page of pagesRef.current) {
      page.blob = null
      page.strokes = []
      page.undoStack.length = 0
      page.redoStack.length = 0
    }
    pagesRef.current = [makePage(nextPageIdRef.current++)]
    currentPageRef.current = 0
    const canvas = canvasRef.current
    const shadow = shadowRef.current
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    if (shadow) {
      shadow.width = 0
      shadow.height = 0
    }
    canvasDisposedRef.current = true
    setPages([{ id: pagesRef.current[0].id, hasContent: false }])
    setCurrentPage(0)
    setHistoryState({ canUndo: false, canRedo: false })
    updatePageList()
    if (storageKey) { try { localStorage.removeItem(storageKey) } catch {} }
  }, [canvasRef, shadowRef, updatePageList, storageKey])

  // Export always renders every page from its strokes at the fixed 1000x1400 size, so the image
  // sent to the AI is the same no matter how far the student zoomed in.
  const exportPages = useCallback(async () => {
    if (switchingRef.current || strokeRef.current) throw new Error('انتظر حتى ينتهي حفظ الصفحة الحالية.')
    const operationId = operationIdRef.current
    switchingRef.current = true
    setIsSwitching(true)
    try {
      const scratch = document.createElement('canvas')
      scratch.width = CANVAS_WIDTH
      scratch.height = CANVAS_HEIGHT
      const scratchContext = scratch.getContext('2d')
      if (!scratchContext) throw new Error('تعذر تجهيز صورة صفحة الإجابة.')
      try {
        for (const page of pagesRef.current) {
          if (!page.hasContent) {
            page.blob = null
            continue
          }
          replayStrokes(scratchContext, scratch, page.strokes)
          page.blob = await canvasToBlob(scratch)
          if (operationId !== operationIdRef.current) throw new Error('أُعيد ضبط صفحات الإجابة قبل اكتمال التصدير.')
        }
      } finally {
        scratch.width = 0
        scratch.height = 0
      }
      const { exportPages: convertPages } = await import('./exportPages')
      if (operationId !== operationIdRef.current) throw new Error('أُعيد ضبط صفحات الإجابة قبل اكتمال التصدير.')
      // activePage = -1: every page is read from its rendered blob.
      return await convertPages(pagesRef.current, -1, canvasRef.current)
    } finally {
      for (const page of pagesRef.current) page.blob = null
      if (operationId === operationIdRef.current) {
        switchingRef.current = false
        setIsSwitching(false)
      }
    }
  }, [canvasRef])

  useEffect(() => {
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const saved = JSON.parse(raw) as { version?: number; currentPage?: number; nextPageId?: number; pages?: Array<{ id: number; strokes: StrokeData[] }>; tool?: DrawingTool; color?: string; penSize?: number; eraserSize?: number }
          if (saved.version === 1 && Array.isArray(saved.pages) && saved.pages.length > 0) {
            pagesRef.current = saved.pages.slice(0, effectiveMaxPages).map((item, index) => {
              const page = makePage(Number.isInteger(item.id) ? item.id : index)
              page.strokes = Array.isArray(item.strokes) ? item.strokes : []
              page.hasContent = pageHasInk(page)
              return page
            })
            currentPageRef.current = Math.max(0, Math.min(pagesRef.current.length - 1, saved.currentPage ?? 0))
            nextPageIdRef.current = Math.max(saved.nextPageId ?? 1, ...pagesRef.current.map((page) => page.id + 1))
            if (saved.tool === 'pen' || saved.tool === 'eraser') { toolRef.current = saved.tool; setTool(saved.tool) }
            if (typeof saved.color === 'string' && COLORS.includes(saved.color)) { colorRef.current = saved.color; setColor(saved.color) }
            if (Number.isFinite(saved.penSize)) { penSizeRef.current = Math.max(2, Math.min(22, saved.penSize!)); setPenSize(penSizeRef.current) }
            if (Number.isFinite(saved.eraserSize)) { eraserSizeRef.current = Math.max(12, Math.min(96, saved.eraserSize!)); setEraserSize(eraserSizeRef.current) }
          }
        }
      } catch (error) {
        console.error('Unable to restore the handwriting draft.', error)
      }
    }
    if (pagesRef.current.length === 0) {
      pagesRef.current = [makePage(0)]
      currentPageRef.current = 0
      setPages([{ id: 0, hasContent: false }])
      setCurrentPage(0)
    }
    try {
      initializeCanvases()
      setCurrentPage(currentPageRef.current)
      updatePageList()
    } catch (error) {
      reportError(error)
    }
    const observer = canvasRef.current?.parentElement && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!canvasDisposedRef.current) return
          try {
            redraw()
          } catch (error) {
            reportError(error)
          }
        })
      : null
    if (observer && canvasRef.current?.parentElement) observer.observe(canvasRef.current.parentElement)
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      operationIdRef.current += 1
      switchingRef.current = false
      observer?.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      strokeRef.current = null
      pendingPointsRef.current.length = 0
      for (const page of pagesRef.current) {
        page.blob = null
        page.strokes = []
        page.undoStack.length = 0
        page.redoStack.length = 0
      }
      pagesRef.current.length = 0
      if (canvasRef.current) {
        canvasRef.current.width = 0
        canvasRef.current.height = 0
      }
      if (shadowRef.current) {
        shadowRef.current.width = 0
        shadowRef.current.height = 0
      }
    }
  }, [canvasRef, initializeCanvases, redo, redraw, reportError, shadowRef, undo, updatePageList, storageKey, effectiveMaxPages])

  const handleContextMenu = useCallback((event: React.MouseEvent) => event.preventDefault(), [])
  const handlePointerLeave = useCallback(() => {
    if (cursorRef.current && !strokeRef.current) cursorRef.current.style.opacity = '0'
  }, [])

  return {
    pages,
    currentPage,
    tool,
    color,
    colors: COLORS,
    penSize,
    eraserSize,
    historyState,
    isSwitching,
    isDrawing,
    cursorRef,
    canvasRef,
    shadowRef,
    pointerDown,
    pointerMove,
    pointerUp,
    finishStroke,
    cancelStroke,
    handleContextMenu,
    handlePointerLeave,
    setTool: setCurrentTool,
    setColor: changePenColor,
    setBrushSize: changeBrushSize,
    setRenderScale,
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
  }
}
