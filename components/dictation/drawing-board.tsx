'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Canvas as FabricCanvas, Point, TSimplePathData } from 'fabric'
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
  Move,
  Plus,
  Redo2,
  RotateCcw,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

const PAGE_WIDTH = 1024
const PAGE_HEIGHT = 768
const MAX_HISTORY = 15

type PageSnapshot = ReturnType<FabricCanvas['toJSON']>
type Page = { id: number; snapshot: PageSnapshot }
type Tool = 'select' | 'pen' | 'eraser'

export type DictationAnswer = {
  pages: { number: number; text: string; image?: string }[]
}

export type DrawingBoardHandle = {
  getAnswer: () => Promise<DictationAnswer>
  clear: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getPageText(snapshot: PageSnapshot): string {
  const objects = isRecord(snapshot) && Array.isArray(snapshot.objects) ? snapshot.objects : []
  return objects
    .filter(isRecord)
    .filter((object) => typeof object.type === 'string' && object.type.toLowerCase().includes('text'))
    .map((object) => (typeof object.text === 'string' ? object.text.trim() : ''))
    .filter(Boolean)
    .join('\n')
}

function hasPageContent(snapshot: PageSnapshot): boolean {
  const objects = isRecord(snapshot) && Array.isArray(snapshot.objects) ? snapshot.objects : []
  return objects.filter(isRecord).some((object) => {
    if (typeof object.type !== 'string' || !object.type.toLowerCase().includes('text')) return true
    return typeof object.text === 'string' && object.text.trim().length > 0
  })
}

export const DrawingBoard = forwardRef<DrawingBoardHandle>(function DrawingBoard(_, ref) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasElementRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<FabricCanvas | null>(null)
  const pagesRef = useRef<Page[]>([{ id: 0, snapshot: { objects: [], background: '#ffffff' } }])
  const pageIdRef = useRef(1)
  const currentPageRef = useRef(0)
  const switchingRef = useRef(false)
  const activeToolRef = useRef<Tool>('pen')
  const restoreRef = useRef(false)
  const saveFrameRef = useRef<number | null>(null)
  const historyRef = useRef(new Map<number, { undo: PageSnapshot[]; redo: PageSnapshot[] }>())
  const [pageCount, setPageCount] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const [tool, setTool] = useState<Tool>('pen')
  const [hasContent, setHasContent] = useState(false)
  const [ready, setReady] = useState(false)
  const [switchingPage, setSwitchingPage] = useState(false)
  const [color, setColor] = useState('#172033')
  const [brushSize, setBrushSize] = useState(4)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [canvasError, setCanvasError] = useState('')

  const syncHistoryButtons = useCallback(() => {
    const history = historyRef.current.get(pagesRef.current[currentPageRef.current]?.id)
    setCanUndo((history?.undo.length ?? 0) > 0)
    setCanRedo((history?.redo.length ?? 0) > 0)
  }, [])

  const commitSnapshot = useCallback(() => {
    const canvas = canvasRef.current
    const page = pagesRef.current[currentPageRef.current]
    if (!canvas || !page || restoreRef.current) return

    const snapshot = canvas.toJSON()
    if (JSON.stringify(snapshot) === JSON.stringify(page.snapshot)) return

    const history = historyRef.current.get(page.id) ?? { undo: [], redo: [] }
    history.undo.push(page.snapshot)
    if (history.undo.length > MAX_HISTORY) history.undo.shift()
    history.redo = []
    historyRef.current.set(page.id, history)
    page.snapshot = snapshot
    setHasContent(canvas.getObjects().length > 0)
    syncHistoryButtons()
  }, [syncHistoryButtons])

  const scheduleSnapshot = useCallback(() => {
    if (restoreRef.current || saveFrameRef.current !== null) return
    saveFrameRef.current = window.requestAnimationFrame(() => {
      saveFrameRef.current = null
      commitSnapshot()
    })
  }, [commitSnapshot])

  const flushSnapshot = useCallback(() => {
    if (saveFrameRef.current !== null) {
      window.cancelAnimationFrame(saveFrameRef.current)
      saveFrameRef.current = null
    }
    commitSnapshot()
  }, [commitSnapshot])

  const restorePage = useCallback(async (index: number) => {
    const canvas = canvasRef.current
    const page = pagesRef.current[index]
    if (!canvas || !page || switchingRef.current) return

    if (saveFrameRef.current !== null) {
      window.cancelAnimationFrame(saveFrameRef.current)
      saveFrameRef.current = null
    }
    switchingRef.current = true
    restoreRef.current = true
    setSwitchingPage(true)
    try {
      await canvas.loadFromJSON(page.snapshot)
      canvas.backgroundColor = '#ffffff'
      canvas.requestRenderAll()
      currentPageRef.current = index
      setCurrentPage(index)
      setHasContent(canvas.getObjects().length > 0)
      syncHistoryButtons()
      setCanvasError('')
    } catch (error) {
      setCanvasError(error instanceof Error ? `تعذر تحميل الصفحة: ${error.message}` : 'تعذر تحميل الصفحة.')
    } finally {
      restoreRef.current = false
      switchingRef.current = false
      setSwitchingPage(false)
    }
  }, [syncHistoryButtons])

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | undefined
    let canvas: FabricCanvas | null = null

    const initialize = async () => {
      const [{ Canvas, PencilBrush, Path, StaticCanvas }, { getStroke }] =
        await Promise.all([import('fabric'), import('perfect-freehand')])
      if (cancelled || !canvasElementRef.current || !stageRef.current) return

      class SmoothBrush extends PencilBrush {
        override convertPointsToSVGPath(points: Point[]): TSimplePathData {
          const outline = getStroke(
            points.map((point) => [point.x, point.y, 0.5]),
            { size: this.width, thinning: 0.35, smoothing: 0.55, streamline: 0.45, simulatePressure: true },
          )
          if (outline.length < 3) return super.convertPointsToSVGPath(points)
          return [
            ['M', outline[0][0], outline[0][1]],
            ...outline.slice(1).map(([x, y]) => ['L', x, y] as ['L', number, number]),
            ['Z'],
          ]
        }

        override createPath(pathData: TSimplePathData) {
          return new Path(pathData, {
            fill: this.color,
            stroke: null,
            strokeWidth: 0,
            objectCaching: false,
          })
        }
      }

      canvas = new Canvas(canvasElementRef.current, {
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        backgroundColor: '#ffffff',
        enableRetinaScaling: false,
        preserveObjectStacking: true,
        selection: true,
      })
      canvasRef.current = canvas
      const brush = new SmoothBrush(canvas)
      brush.color = '#172033'
      brush.width = 4
      canvas.freeDrawingBrush = brush
      canvas.isDrawingMode = true
      canvas.upperCanvasEl.style.touchAction = 'none'
      pagesRef.current[0].snapshot = canvas.toJSON()
      historyRef.current.set(0, { undo: [], redo: [] })

      const updateSize = () => {
        const stage = stageRef.current
        if (!stage || !canvas) return
        const { width, height } = stage.getBoundingClientRect()
        if (!width || !height) return
        canvas.setDimensions({ width: Math.round(width), height: Math.round(height) })
        const scale = Math.min(width / PAGE_WIDTH, height / PAGE_HEIGHT)
        canvas.setViewportTransform([
          scale,
          0,
          0,
          scale,
          (width - PAGE_WIDTH * scale) / 2,
          (height - PAGE_HEIGHT * scale) / 2,
        ])
        canvas.requestRenderAll()
      }

      resizeObserver = new ResizeObserver(updateSize)
      resizeObserver.observe(stageRef.current)
      updateSize()

      canvas.on('path:created', ({ path }) => {
        if (activeToolRef.current === 'eraser') {
          const erasedBounds = path.getBoundingRect()
          for (const object of [...canvas.getObjects()]) {
            if (!object.type.toLowerCase().includes('text')) continue
            const bounds = object.getBoundingRect()
            const overlaps =
              bounds.left < erasedBounds.left + erasedBounds.width &&
              bounds.left + bounds.width > erasedBounds.left &&
              bounds.top < erasedBounds.top + erasedBounds.height &&
              bounds.top + bounds.height > erasedBounds.top
            if (overlaps) canvas.remove(object)
          }
        }
        scheduleSnapshot()
      })
      canvas.on('object:added', scheduleSnapshot)
      canvas.on('object:removed', scheduleSnapshot)
      canvas.on('object:modified', scheduleSnapshot)
      canvas.on('text:changed', scheduleSnapshot)
      setReady(true)
    }

    void initialize().catch((error: unknown) => {
      if (!cancelled) setCanvasError(error instanceof Error ? error.message : 'تعذر تجهيز مساحة الكتابة.')
    })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      if (saveFrameRef.current !== null) window.cancelAnimationFrame(saveFrameRef.current)
      canvas?.dispose()
      canvasRef.current = null
    }
  }, [scheduleSnapshot])

  const setActiveTool = (nextTool: Tool) => {
    const canvas = canvasRef.current
    if (!canvas || switchingRef.current) return
    activeToolRef.current = nextTool
    canvas.isDrawingMode = nextTool !== 'select'
    canvas.selection = nextTool === 'select'
    if (nextTool !== 'select' && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = nextTool === 'eraser' ? '#ffffff' : color
      canvas.freeDrawingBrush.width = nextTool === 'eraser' ? Math.max(brushSize * 5, 18) : brushSize
    }
    setTool(nextTool)
  }

  const updateBrush = (nextColor = color, nextSize = brushSize) => {
    setColor(nextColor)
    setBrushSize(nextSize)
    const brush = canvasRef.current?.freeDrawingBrush
    if (brush && tool !== 'eraser') {
      brush.color = nextColor
      brush.width = nextSize
    }
  }

  const changePage = async (index: number) => {
    if (!canvasRef.current || switchingRef.current || index < 0 || index >= pagesRef.current.length || index === currentPageRef.current) return
    flushSnapshot()
    await restorePage(index)
    setActiveTool('pen')
  }

  const addPage = async () => {
    const canvas = canvasRef.current
    if (!canvas || switchingRef.current) return
    flushSnapshot()
    const newIndex = pagesRef.current.length
    const id = pageIdRef.current++
    pagesRef.current.push({ id, snapshot: { objects: [], background: '#ffffff' } })
    historyRef.current.set(id, { undo: [], redo: [] })
    setPageCount(pagesRef.current.length)
    await restorePage(newIndex)
    setActiveTool('pen')
  }

  const deletePage = async () => {
    if (pagesRef.current.length <= 1 || switchingRef.current) return
    if (!confirm(`تحذف الصفحة ${currentPageRef.current + 1} بكل اللي فيها؟`)) return
    const deletedPage = pagesRef.current[currentPageRef.current]
    historyRef.current.delete(deletedPage.id)
    pagesRef.current.splice(currentPageRef.current, 1)
    const nextIndex = Math.min(currentPageRef.current, pagesRef.current.length - 1)
    setPageCount(pagesRef.current.length)
    await restorePage(nextIndex)
  }

  const addText = async () => {
    const { Textbox } = await import('fabric')
    const canvas = canvasRef.current
    if (!canvas || switchingRef.current) return
    setActiveTool('select')
    const text = new Textbox('', {
      left: PAGE_WIDTH / 2 - 140,
      top: PAGE_HEIGHT / 2 - 30,
      width: 280,
      fontSize: 32,
      fill: color,
      textAlign: 'right',
      direction: 'rtl',
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    text.enterEditing()
    canvas.requestRenderAll()
  }

  const addShape = async (shape: 'rectangle' | 'circle') => {
    const { Rect, Ellipse } = await import('fabric')
    const canvas = canvasRef.current
    if (!canvas || switchingRef.current) return
    setActiveTool('select')
    const object = shape === 'rectangle'
      ? new Rect({
          left: PAGE_WIDTH / 2 - 140,
          top: PAGE_HEIGHT / 2 - 70,
          width: 280,
          height: 140,
          fill: 'transparent',
          stroke: color,
          strokeWidth: brushSize,
        })
      : new Ellipse({
          left: PAGE_WIDTH / 2 - 85,
          top: PAGE_HEIGHT / 2 - 85,
          rx: 85,
          ry: 85,
          fill: 'transparent',
          stroke: color,
          strokeWidth: brushSize,
        })
    canvas.add(object)
    canvas.setActiveObject(object)
    canvas.requestRenderAll()
  }

  const changeZoom = async (factor: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { Point } = await import('fabric')
    const zoom = Math.max(0.5, Math.min(2.5, canvas.getZoom() * factor))
    canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), zoom)
  }

  const changeHistory = async (direction: 'undo' | 'redo') => {
    const canvas = canvasRef.current
    const page = pagesRef.current[currentPageRef.current]
    if (!canvas || !page) return
    flushSnapshot()
    const history = historyRef.current.get(page.id)
    const source = direction === 'undo' ? history?.undo : history?.redo
    const destination = direction === 'undo' ? history?.redo : history?.undo
    const snapshot = source?.pop()
    if (!history || !snapshot || !destination) return
    destination.push(page.snapshot)
    page.snapshot = snapshot
    await restorePage(currentPageRef.current)
  }

  const clearPage = () => {
    const canvas = canvasRef.current
    if (!canvas || canvas.getObjects().length === 0) return
    if (!confirm('تمسح كل اللي في الصفحة دي؟')) return
    flushSnapshot()
    const page = pagesRef.current[currentPageRef.current]
    if (!page) return
    const history = historyRef.current.get(page.id) ?? { undo: [], redo: [] }
    history.undo.push(page.snapshot)
    if (history.undo.length > MAX_HISTORY) history.undo.shift()
    history.redo = []
    historyRef.current.set(page.id, history)
    canvas.discardActiveObject()
    for (const object of [...canvas.getObjects()]) canvas.remove(object)
    canvas.backgroundColor = '#ffffff'
    canvas.requestRenderAll()
    page.snapshot = canvas.toJSON()
    setHasContent(false)
    syncHistoryButtons()
  }

  useImperativeHandle(ref, () => ({
    async getAnswer() {
      if (switchingRef.current) throw new Error('استنى الصفحة الحالية تجهز قبل التصحيح.')
      const canvas = canvasRef.current
      flushSnapshot()
      const activePage = pagesRef.current[currentPageRef.current]
      if (canvas && activePage) {
        activePage.snapshot = canvas.toJSON()
      }

      const { StaticCanvas } = await import('fabric')
      const pages: DictationAnswer['pages'] = []
      for (const [index, page] of pagesRef.current.entries()) {
        const text = getPageText(page.snapshot)
        if (!hasPageContent(page.snapshot)) continue
        const exportCanvas = new StaticCanvas(document.createElement('canvas'), {
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          backgroundColor: '#ffffff',
          enableRetinaScaling: false,
        })
        try {
          await exportCanvas.loadFromJSON(page.snapshot)
          pages.push({
            number: index + 1,
            text,
            image: exportCanvas.toDataURL({ format: 'jpeg', quality: 0.7, multiplier: 1 }),
          })
        } finally {
          await exportCanvas.dispose()
        }
      }
      return { pages }
    },
    clear: clearPage,
  }), [clearPage, flushSnapshot])

  const toolbarButtonClass = (active = false) =>
    `inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-white text-neutral-700 hover:bg-neutral-100'
    }`

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white p-2">
        <div className="flex items-center gap-1">
          <button type="button" className={toolbarButtonClass(tool === 'select')} aria-label="اختيار وتحريك" title="اختيار وتحريك" disabled={!ready} onClick={() => setActiveTool('select')}>
            <Move className="size-4" aria-hidden />
          </button>
          <button type="button" className={toolbarButtonClass(tool === 'pen')} aria-label="قلم" title="قلم" disabled={!ready} onClick={() => setActiveTool('pen')}>
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z" /></svg>
          </button>
          <button type="button" className={toolbarButtonClass(tool === 'eraser')} aria-label="ممحاة" title="ممحاة" disabled={!ready} onClick={() => setActiveTool('eraser')}>
            <Eraser className="size-4" aria-hidden />
          </button>
          <button type="button" className={toolbarButtonClass()} aria-label="إضافة نص" title="إضافة نص" disabled={!ready} onClick={() => void addText()}>
            <Type className="size-4" aria-hidden />
          </button>
          <button type="button" className={toolbarButtonClass()} aria-label="إضافة مستطيل" title="إضافة مستطيل" disabled={!ready} onClick={() => void addShape('rectangle')}>
            <Square className="size-4" aria-hidden />
          </button>
          <button type="button" className={toolbarButtonClass()} aria-label="إضافة دائرة" title="إضافة دائرة" disabled={!ready} onClick={() => void addShape('circle')}>
            <Circle className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <label className="flex size-9 items-center justify-center rounded-lg border bg-white" title="لون القلم">
            <input type="color" value={color} disabled={!ready} onChange={(event) => updateBrush(event.target.value)} className="size-6 cursor-pointer border-0 bg-transparent p-0" aria-label="لون القلم" />
          </label>
          <input
            type="range"
            min="1"
            max="12"
            value={brushSize}
            disabled={!ready}
            onChange={(event) => updateBrush(color, Number(event.target.value))}
            className="w-16 accent-primary"
            aria-label="سُمك القلم"
            title="سُمك القلم"
          />
          <button type="button" className={toolbarButtonClass()} aria-label="تصغير" title="تصغير" disabled={!ready} onClick={() => void changeZoom(0.85)}>
            <ZoomOut className="size-4" aria-hidden />
          </button>
          <button type="button" className={toolbarButtonClass()} aria-label="تكبير" title="تكبير" disabled={!ready} onClick={() => void changeZoom(1.18)}>
            <ZoomIn className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" className={toolbarButtonClass()} aria-label="تراجع" title="تراجع" disabled={!ready || !canUndo} onClick={() => void changeHistory('undo')}>
            <Undo2 className="size-4" aria-hidden />
          </button>
          <button type="button" className={toolbarButtonClass()} aria-label="إعادة" title="إعادة" disabled={!ready || !canRedo} onClick={() => void changeHistory('redo')}>
            <Redo2 className="size-4" aria-hidden />
          </button>
          <button type="button" className={toolbarButtonClass()} aria-label="مسح الصفحة" title="مسح الصفحة" disabled={!ready || !hasContent} onClick={clearPage}>
            <RotateCcw className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        <div ref={stageRef} className="relative h-full max-h-full max-w-full flex-none aspect-[4/3] overflow-hidden rounded-md border bg-white shadow-sm">
          <canvas ref={canvasElementRef} aria-label={`صفحة التسميع ${currentPage + 1}`} />
          {!ready && <div className="absolute inset-0 flex items-center justify-center bg-white text-sm text-muted-foreground">بيجهز مساحة الكتابة…</div>}
        </div>
      </div>

      {canvasError && <p role="alert" className="border-t bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{canvasError}</p>}

      <div className="flex items-center justify-center gap-2 border-t bg-white px-2 py-2">
        <button type="button" className={toolbarButtonClass()} aria-label="الصفحة السابقة" title="الصفحة السابقة" disabled={!ready || switchingPage || currentPage === 0} onClick={() => void changePage(currentPage - 1)}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <span className="min-w-20 text-center text-sm font-medium" aria-live="polite">صفحة {currentPage + 1} من {pageCount}</span>
        <button type="button" className={toolbarButtonClass()} aria-label="الصفحة التالية" title="الصفحة التالية" disabled={!ready || switchingPage || currentPage >= pageCount - 1} onClick={() => void changePage(currentPage + 1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button type="button" className={toolbarButtonClass()} aria-label="إضافة صفحة" title="إضافة صفحة" disabled={!ready || switchingPage} onClick={() => void addPage()}>
          <Plus className="size-4" aria-hidden />
        </button>
        <button type="button" className={toolbarButtonClass()} aria-label="حذف الصفحة" title="حذف الصفحة" disabled={!ready || switchingPage || pageCount <= 1} onClick={() => void deletePage()}>
          <Eraser className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
})
