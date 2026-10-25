'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { PageBar } from './PageBar'
import { Toolbar } from './Toolbar'
import { CANVAS_HEIGHT, CANVAS_WIDTH, useDrawingEngine, type PageInfo } from './useDrawingEngine'

export type HandwritingEditorHandle = {
  exportPages: () => Promise<Blob[]>
  hasContent: () => boolean
  reset: () => void
}

type Props = {
  maxPages?: number
  onChange?: (info: PageInfo) => void
}

export const HandwritingEditor = forwardRef<HandwritingEditorHandle, Props>(function HandwritingEditor(
  { maxPages = 10, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shadowRef = useRef<HTMLCanvasElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
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
  } = useDrawingEngine(canvasRef, shadowRef, { maxPages, onChange })

  useImperativeHandle(ref, () => ({
    async exportPages() {
      return exportPages()
    },
    hasContent,
    reset,
  }), [exportPages, hasContent, reset])

  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement === editorRef.current
      setIsFullscreen(active)
      if (active) setFallbackFullscreen(false)
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

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

  const editorClass = fallbackFullscreen
    ? 'fixed inset-0 z-[100] overflow-y-auto bg-slate-100 p-3 sm:p-5'
    : 'space-y-3'
  const fullscreenContentClass = isFullscreen || fallbackFullscreen
    ? 'mx-auto flex min-h-full max-w-6xl flex-col gap-3'
    : 'space-y-3'

  return (
    <div ref={editorRef} className={editorClass} dir="rtl">
      <div className={fullscreenContentClass}>
        <Toolbar
          tool={tool}
          color={color}
          colors={colors}
          size={tool === 'pen' ? penSize : eraserSize}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          isBusy={isSwitching || isDrawing}
          isFullscreen={isFullscreen || fallbackFullscreen}
          onToolChange={setTool}
          onColorChange={setColor}
          onSizeChange={setBrushSize}
          onUndo={undo}
          onRedo={redo}
          onClear={clearPage}
          onFullscreen={() => void toggleFullscreen().catch((error: unknown) => reportError(error))}
        />

        <div className="space-y-3">
          <PageBar
            currentPage={currentPage}
            pageCount={pages.length}
            maxPages={Math.max(1, Math.min(10, Math.floor(maxPages) || 10))}
            isBusy={isSwitching || isDrawing}
            onPrevious={() => runPageAction(() => switchPage(currentPage - 1))}
            onNext={() => runPageAction(() => switchPage(currentPage + 1))}
            onAdd={() => runPageAction(addPage)}
            onDelete={() => runPageAction(deletePage)}
          />

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-42px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <div>
                <p className="text-sm font-bold text-slate-800">دفتر الإجابة</p>
                <p className="text-xs text-slate-500">اكتب إجابتك بخط واضح داخل المساحة</p>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                {pages[currentPage]?.hasContent ? 'فيها كتابة' : 'صفحة فارغة'}
              </span>
            </div>
            <div
              className="relative aspect-[5/7] w-full overscroll-contain overflow-hidden bg-white"
              style={{
                backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 39px, #e2eaf2 39px, #e2eaf2 40px)',
                backgroundSize: '100% 40px',
              }}
              onContextMenu={handleContextMenu}
            >
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
                style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                aria-label="مساحة كتابة الإجابة"
              />
              <div
                ref={cursorRef}
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 z-10 rounded-full border border-slate-500/70 bg-slate-400/25 opacity-0"
              />
            </div>
          </div>
          <p className="px-1 text-center text-xs text-slate-500">
            التراجع والإعادة متاحان لآخر 10 خطوات في كل صفحة
          </p>
        </div>
      </div>
      <canvas ref={shadowRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden" aria-hidden />
    </div>
  )
})
