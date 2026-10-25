'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export const CANVAS_WIDTH = 1000
export const CANVAS_HEIGHT = 1400
const MAX_HISTORY = 10

export type DrawingTool = 'pen' | 'eraser'

type Patch = { x: number; y: number; imageData: ImageData }
export type DrawingPage = {
  id: number
  blob: Blob | null
  hasContent: boolean
  undoStack: Patch[]
  redoStack: Patch[]
}
export type PageInfo = { pageCount: number; hasContent: boolean }
export type DrawingEngineOptions = {
  maxPages: number
  onChange?: (info: PageInfo) => void
  onError?: (message: string) => void
}

type Point = { x: number; y: number; pressure: number }
type Stroke = {
  pointerId: number
  tool: DrawingTool
  color: string
  size: number
  last: Point
  lastMidpoint: Point
  bounds: { left: number; top: number; right: number; bottom: number }
}

const COLORS = ['#171717', '#2563eb', '#dc2626', '#15803d']
const makePage = (id: number): DrawingPage => ({
  id,
  blob: null,
  hasContent: false,
  undoStack: [],
  redoStack: [],
})

function contextOf(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d', { desynchronized: true, willReadFrequently: true })
}

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

function pointFromEvent(event: PointerEvent, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect()
  const pressure = event.pointerType === 'pen' && event.pressure > 0
    ? Math.max(0.75, Math.min(1.25, 0.85 + event.pressure * 0.3))
    : 1
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    pressure,
  }
}

function hasVisiblePixels(canvas: HTMLCanvasElement) {
  if (!canvas.width || !canvas.height) return false
  const context = contextOf(canvas)
  if (!context) throw new Error('متصفحك لا يدعم مساحة الكتابة.')
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let pixel = 3; pixel < data.length; pixel += 4) {
    if (data[pixel] > 8) return true
  }
  return false
}

export function useDrawingEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  shadowRef: RefObject<HTMLCanvasElement | null>,
  { maxPages, onChange, onError }: DrawingEngineOptions,
) {
  const pagesRef = useRef<DrawingPage[]>([makePage(0)])
  const currentPageRef = useRef(0)
  const nextPageIdRef = useRef(1)
  const operationIdRef = useRef(0)
  const onChangeRef = useRef(onChange)
  const onErrorRef = useRef(onError)
  const strokeRef = useRef<Stroke | null>(null)
  const penActiveRef = useRef(false)
  const pendingPointsRef = useRef<Point[]>([])
  const animationRef = useRef<number | null>(null)
  const switchingRef = useRef(false)
  const canvasDisposedRef = useRef(false)
  const fallbackPointerIdRef = useRef<number | null>(null)
  const fallbackListenersRef = useRef<(() => void) | null>(null)
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

  const reportError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'تعذر إكمال عملية الكتابة.'
    console.error('Unable to update the handwriting editor.', error)
    onErrorRef.current?.(message)
  }, [])

  const initializeCanvases = useCallback(() => {
    const canvas = canvasRef.current
    const shadow = shadowRef.current
    if (!canvas || !shadow) throw new Error('تعذر تجهيز مساحة الكتابة.')
    if (canvas.width !== CANVAS_WIDTH || canvas.height !== CANVAS_HEIGHT) {
      canvas.width = CANVAS_WIDTH
      canvas.height = CANVAS_HEIGHT
    }
    if (shadow.width !== CANVAS_WIDTH || shadow.height !== CANVAS_HEIGHT) {
      shadow.width = CANVAS_WIDTH
      shadow.height = CANVAS_HEIGHT
    }
    const context = contextOf(canvas)
    const shadowContext = contextOf(shadow)
    if (!context || !shadowContext) throw new Error('متصفحك لا يدعم مساحة الكتابة.')
    context.lineCap = 'round'
    context.lineJoin = 'round'
    shadowContext.lineCap = 'round'
    shadowContext.lineJoin = 'round'
    canvasDisposedRef.current = false
    return { canvas, shadow, context, shadowContext }
  }, [canvasRef, shadowRef])

  const updatePageList = useCallback(() => {
    const currentPages = pagesRef.current
    setPages(currentPages.map(({ id, hasContent }) => ({ id, hasContent })))
    onChangeRef.current?.({
      pageCount: currentPages.length,
      hasContent: currentPages.some((page) => page.hasContent),
    })
  }, [])

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

  const saveCurrentPage = useCallback(async () => {
    const page = pagesRef.current[currentPageRef.current]
    const canvas = canvasRef.current
    if (!page || !canvas || !page.hasContent) {
      if (page) page.blob = null
      return
    }
    page.blob = await canvasToBlob(canvas)
  }, [canvasRef])

  const updateShadowPatch = useCallback((patch: Patch) => {
    const { shadowContext } = initializeCanvases()
    shadowContext.putImageData(patch.imageData, patch.x, patch.y)
  }, [initializeCanvases])

  const setHistoryEntry = useCallback((page: DrawingPage, bounds: Stroke['bounds']) => {
    const canvas = canvasRef.current
    const shadow = shadowRef.current
    if (!canvas || !shadow) return
    const left = Math.max(0, Math.floor(bounds.left))
    const top = Math.max(0, Math.floor(bounds.top))
    const right = Math.min(canvas.width, Math.ceil(bounds.right))
    const bottom = Math.min(canvas.height, Math.ceil(bounds.bottom))
    if (right <= left || bottom <= top) return
    const width = right - left
    const height = bottom - top
    const beforeContext = contextOf(shadow)
    if (!beforeContext) throw new Error('تعذر تجهيز سجل التراجع.')
    const before: Patch = { x: left, y: top, imageData: beforeContext.getImageData(left, top, width, height) }
    page.undoStack.push(before)
    if (page.undoStack.length > MAX_HISTORY) page.undoStack.shift()
    page.redoStack.length = 0
    const { shadowContext } = initializeCanvases()
    // Erased pixels are transparent: clear first, otherwise the shadow keeps the erased ink
    // and a later undo would bring it back.
    shadowContext.clearRect(left, top, width, height)
    shadowContext.drawImage(canvas, left, top, width, height, left, top, width, height)
    syncHistoryState()
  }, [canvasRef, initializeCanvases, shadowRef, syncHistoryState])

  const processPoint = useCallback((point: Point, stroke: Stroke) => {
    const { context } = initializeCanvases()
    const lineWidth = stroke.size * point.pressure
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    context.lineWidth = lineWidth
    context.beginPath()
    const middleX = (stroke.last.x + point.x) / 2
    const middleY = (stroke.last.y + point.y) / 2
    context.moveTo(stroke.lastMidpoint.x, stroke.lastMidpoint.y)
    context.quadraticCurveTo(stroke.last.x, stroke.last.y, middleX, middleY)
    context.stroke()
    context.globalCompositeOperation = 'source-over'
    const margin = stroke.size * 0.65 + 2
    stroke.bounds.left = Math.min(stroke.bounds.left, stroke.last.x - margin, point.x - margin)
    stroke.bounds.top = Math.min(stroke.bounds.top, stroke.last.y - margin, point.y - margin)
    stroke.bounds.right = Math.max(stroke.bounds.right, stroke.last.x + margin, point.x + margin)
    stroke.bounds.bottom = Math.max(stroke.bounds.bottom, stroke.last.y + margin, point.y + margin)
    stroke.last = point
    stroke.lastMidpoint = { x: middleX, y: middleY, pressure: point.pressure }
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

  const finishStroke = useCallback((pointerId?: number) => {
    const stroke = strokeRef.current
    if (!stroke || (pointerId !== undefined && stroke.pointerId !== pointerId)) return
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    drawPendingPoints()
    const { context } = initializeCanvases()
    context.beginPath()
    context.moveTo(stroke.lastMidpoint.x, stroke.lastMidpoint.y)
    context.quadraticCurveTo(stroke.last.x, stroke.last.y, stroke.last.x, stroke.last.y)
    context.strokeStyle = stroke.color
    context.lineWidth = stroke.size * stroke.last.pressure
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    context.stroke()
    context.globalCompositeOperation = 'source-over'
    try {
      setHistoryEntry(pagesRef.current[currentPageRef.current], stroke.bounds)
      updateContentState(currentPageRef.current, stroke.tool === 'pen' || hasVisiblePixels(context.canvas))
    } catch (error) {
      reportError(error)
    }
    strokeRef.current = null
    pendingPointsRef.current.length = 0
    penActiveRef.current = false
    fallbackPointerIdRef.current = null
    fallbackListenersRef.current?.()
    fallbackListenersRef.current = null
    setIsDrawing(false)
  }, [drawPendingPoints, initializeCanvases, reportError, setHistoryEntry, updateContentState])

  const pointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || switchingRef.current) return
    if (event.pointerType === 'touch' && penActiveRef.current) return
    if (strokeRef.current) {
      // A stroke whose pointerup was lost would block drawing forever; close it first.
      if (strokeRef.current.pointerId === event.pointerId) return
      finishStroke(strokeRef.current.pointerId)
    }
    if (event.pointerType === 'pen') penActiveRef.current = true
    event.preventDefault()
    const { canvas, context } = initializeCanvases()
    const point = pointFromEvent(event.nativeEvent, canvas)
    const activeTool = tool
    const size = activeTool === 'eraser' ? eraserSizeRef.current : penSizeRef.current
    const margin = size * 0.65 + 2
    strokeRef.current = {
      pointerId: event.pointerId,
      tool: activeTool,
      color: activeTool === 'eraser' ? '#000000' : colorRef.current,
      size,
      last: point,
      lastMidpoint: point,
      bounds: { left: point.x, top: point.y, right: point.x, bottom: point.y },
    }
    context.beginPath()
    context.arc(point.x, point.y, size * point.pressure / 2, 0, Math.PI * 2)
    context.fillStyle = activeTool === 'eraser' ? '#000000' : colorRef.current
    context.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over'
    context.fill()
    context.globalCompositeOperation = 'source-over'
    strokeRef.current.bounds = {
      left: point.x - size / 2 - margin,
      top: point.y - size / 2 - margin,
      right: point.x + size / 2 + margin,
      bottom: point.y + size / 2 + margin,
    }
    setIsDrawing(true)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      const pointerId = event.pointerId
      const canvas = event.currentTarget
      fallbackPointerIdRef.current = pointerId
      const onMove = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return
        const coalesced = typeof nativeEvent.getCoalescedEvents === 'function'
          ? nativeEvent.getCoalescedEvents()
          : [nativeEvent]
        schedulePoints(coalesced.map((item) => pointFromEvent(item, canvas)))
      }
      const onEnd = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return
        if (nativeEvent.type === 'pointerup') {
          schedulePoints([pointFromEvent(nativeEvent, canvas)])
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
  }, [eraserSizeRef, finishStroke, initializeCanvases, schedulePoints, tool])

  const pointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (fallbackPointerIdRef.current === event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (cursorRef.current && tool === 'eraser' && event.pointerType !== 'touch') {
      const scale = rect.width / CANVAS_WIDTH
      const diameter = eraserSizeRef.current * scale
      cursorRef.current.style.width = `${diameter}px`
      cursorRef.current.style.height = `${diameter}px`
      cursorRef.current.style.transform = `translate(${event.clientX - rect.left - diameter / 2}px, ${event.clientY - rect.top - diameter / 2}px)`
      cursorRef.current.style.opacity = '1'
    }
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    event.preventDefault()
    const nativeEvent = event.nativeEvent
    const coalesced = typeof nativeEvent.getCoalescedEvents === 'function'
      ? nativeEvent.getCoalescedEvents()
      : [nativeEvent]
    schedulePoints(coalesced.map((item) => pointFromEvent(item, event.currentTarget)))
  }, [eraserSizeRef, schedulePoints, tool])

  const pointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (fallbackPointerIdRef.current === event.pointerId) return
    if (strokeRef.current?.pointerId === event.pointerId) {
      schedulePoints([pointFromEvent(event.nativeEvent, event.currentTarget)])
    }
    finishStroke(event.pointerId)
  }, [finishStroke, schedulePoints])

  const setCurrentTool = useCallback((nextTool: DrawingTool) => setTool(nextTool), [])

  const changePenColor = useCallback((nextColor: string) => {
    if (!COLORS.includes(nextColor)) return
    colorRef.current = nextColor
    setColor(nextColor)
  }, [])

  const changeBrushSize = useCallback((size: number) => {
    if (!Number.isFinite(size)) return
    if (tool === 'pen') {
      const next = Math.max(2, Math.min(22, size))
      penSizeRef.current = next
      setPenSize(next)
    } else {
      const next = Math.max(12, Math.min(96, size))
      eraserSizeRef.current = next
      setEraserSize(next)
    }
  }, [tool])

  const applyHistory = useCallback((direction: 'undo' | 'redo') => {
    if (strokeRef.current || switchingRef.current) return
    const page = pagesRef.current[currentPageRef.current]
    const canvas = canvasRef.current
    if (!page || !canvas) return
    const source = direction === 'undo' ? page.undoStack : page.redoStack
    const destination = direction === 'undo' ? page.redoStack : page.undoStack
    const patch = source.pop()
    if (!patch) return
    const { context, shadowContext } = initializeCanvases()
    const previous: Patch = {
      x: patch.x,
      y: patch.y,
      imageData: context.getImageData(patch.x, patch.y, patch.imageData.width, patch.imageData.height),
    }
    destination.push(previous)
    if (direction === 'redo' && page.undoStack.length > MAX_HISTORY) page.undoStack.shift()
    context.putImageData(patch.imageData, patch.x, patch.y)
    shadowContext.putImageData(patch.imageData, patch.x, patch.y)
    try {
      updateContentState(currentPageRef.current, hasVisiblePixels(canvas))
    } catch (error) {
      reportError(error)
    }
    syncHistoryState()
  }, [canvasRef, initializeCanvases, reportError, syncHistoryState, updateContentState])

  const undo = useCallback(() => applyHistory('undo'), [applyHistory])
  const redo = useCallback(() => applyHistory('redo'), [applyHistory])

  const clearPage = useCallback(() => {
    if (strokeRef.current || switchingRef.current) return
    try {
      const { canvas, context, shadowContext } = initializeCanvases()
      const page = pagesRef.current[currentPageRef.current]
      if (!page) return
      const before: Patch = { x: 0, y: 0, imageData: context.getImageData(0, 0, canvas.width, canvas.height) }
      context.clearRect(0, 0, canvas.width, canvas.height)
      shadowContext.clearRect(0, 0, shadowRef.current?.width ?? 0, shadowRef.current?.height ?? 0)
      page.undoStack.push(before)
      if (page.undoStack.length > MAX_HISTORY) page.undoStack.shift()
      page.redoStack.length = 0
      page.blob = null
      updateContentState(currentPageRef.current, false)
      syncHistoryState()
    } catch (error) {
      reportError(error)
    }
  }, [initializeCanvases, reportError, shadowRef, syncHistoryState, updateContentState])

  const switchPage = useCallback(async (nextIndex: number) => {
    if (
      nextIndex < 0 ||
      nextIndex >= pagesRef.current.length ||
      nextIndex === currentPageRef.current ||
      switchingRef.current ||
      strokeRef.current
    ) return
    const operationId = ++operationIdRef.current
    switchingRef.current = true
    setIsSwitching(true)
    try {
      await saveCurrentPage()
      if (operationId !== operationIdRef.current) return
      const page = pagesRef.current[nextIndex]
      const bitmap = page.blob ? await createImageBitmap(page.blob) : null
      try {
        if (operationId !== operationIdRef.current) return
        const { canvas, shadow, context, shadowContext } = initializeCanvases()
        context.clearRect(0, 0, canvas.width, canvas.height)
        shadowContext.clearRect(0, 0, shadow.width, shadow.height)
        if (bitmap) {
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          shadowContext.drawImage(bitmap, 0, 0, shadow.width, shadow.height)
          page.blob = null
        }
        currentPageRef.current = nextIndex
        setCurrentPage(nextIndex)
        syncHistoryState()
      } finally {
        bitmap?.close()
      }
    } catch (error) {
      reportError(error)
    } finally {
      if (operationId === operationIdRef.current) {
        switchingRef.current = false
        setIsSwitching(false)
      }
    }
  }, [initializeCanvases, reportError, saveCurrentPage, syncHistoryState])

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
    const operationId = ++operationIdRef.current
    switchingRef.current = true
    setIsSwitching(true)
    try {
      await saveCurrentPage()
      if (operationId !== operationIdRef.current) return
      const nextIndex = Math.min(current, pagesRef.current.length - 2)
      const target = pagesRef.current[current === pagesRef.current.length - 1 ? current - 1 : current + 1]
      const targetBitmap = target.blob ? await createImageBitmap(target.blob) : null
      try {
        if (operationId !== operationIdRef.current) return
        const removed = pagesRef.current.splice(current, 1)[0]
        if (removed) {
          removed.blob = null
          removed.undoStack.length = 0
          removed.redoStack.length = 0
        }
        const { canvas, shadow, context, shadowContext } = initializeCanvases()
        context.clearRect(0, 0, canvas.width, canvas.height)
        shadowContext.clearRect(0, 0, shadow.width, shadow.height)
        if (targetBitmap) {
          context.drawImage(targetBitmap, 0, 0, canvas.width, canvas.height)
          shadowContext.drawImage(targetBitmap, 0, 0, shadow.width, shadow.height)
          target.blob = null
        }
        currentPageRef.current = nextIndex
        setCurrentPage(nextIndex)
        updatePageList()
        syncHistoryState()
      } finally {
        targetBitmap?.close()
      }
    } catch (error) {
      reportError(error)
    } finally {
      if (operationId === operationIdRef.current) {
        switchingRef.current = false
        setIsSwitching(false)
      }
    }
  }, [clearPage, initializeCanvases, reportError, saveCurrentPage, syncHistoryState, updatePageList])

  const hasContent = useCallback(() => pagesRef.current.some((page) => page.hasContent), [])

  const reset = useCallback(() => {
    operationIdRef.current += 1
    switchingRef.current = false
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    strokeRef.current = null
    pendingPointsRef.current.length = 0
    fallbackPointerIdRef.current = null
    fallbackListenersRef.current?.()
    fallbackListenersRef.current = null
    penActiveRef.current = false
    setIsDrawing(false)
    setIsSwitching(false)
    for (const page of pagesRef.current) {
      page.blob = null
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
  }, [canvasRef, shadowRef, updatePageList])

  const exportPages = useCallback(async () => {
    if (switchingRef.current || strokeRef.current) throw new Error('انتظر حتى ينتهي حفظ الصفحة الحالية.')
    const operationId = operationIdRef.current
    switchingRef.current = true
    setIsSwitching(true)
    const page = pagesRef.current[currentPageRef.current]
    try {
      if (page) updateContentState(currentPageRef.current, hasVisiblePixels(initializeCanvases().canvas))
      await saveCurrentPage()
      if (operationId !== operationIdRef.current) throw new Error('أُعيد ضبط صفحات الإجابة قبل اكتمال التصدير.')
      if (page) page.blob = null
      const { exportPages: convertPages } = await import('./exportPages')
      if (operationId !== operationIdRef.current) throw new Error('أُعيد ضبط صفحات الإجابة قبل اكتمال التصدير.')
      return await convertPages(pagesRef.current, currentPageRef.current, canvasRef.current)
    } finally {
      if (operationId === operationIdRef.current) {
        switchingRef.current = false
        setIsSwitching(false)
      }
    }
  }, [canvasRef, initializeCanvases, saveCurrentPage, updateContentState])

  useEffect(() => {
    if (pagesRef.current.length === 0) {
      pagesRef.current = [makePage(0)]
      currentPageRef.current = 0
      setPages([{ id: 0, hasContent: false }])
      setCurrentPage(0)
    }
    try {
      initializeCanvases()
      updatePageList()
    } catch (error) {
      reportError(error)
    }
    const observer = canvasRef.current?.parentElement && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!canvasDisposedRef.current) return
          try {
            initializeCanvases()
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
  }, [canvasRef, initializeCanvases, redo, reportError, shadowRef, undo, updatePageList])

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
    handleContextMenu,
    handlePointerLeave,
    setTool: setCurrentTool,
    setColor: changePenColor,
    setBrushSize: changeBrushSize,
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
