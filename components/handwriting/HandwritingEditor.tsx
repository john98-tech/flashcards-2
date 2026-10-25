'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
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
`

export type HandwritingEditorHandle = {
  exportPages: () => Promise<Blob[]>
  hasContent: () => boolean
  reset: () => void
}

type Props = {
  maxPages?: number
  onChange?: (info: PageInfo) => void
  onError?: (message: string) => void
}

export const HandwritingEditor = forwardRef<HandwritingEditorHandle, Props>(function HandwritingEditor(
  { maxPages = 10, onChange, onError },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shadowRef = useRef<HTMLCanvasElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
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
      const w = Math.floor(Math.min(availW, availH * ratio))
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
  const [confirmAction, setConfirmAction] = useState<'clear' | 'delete' | null>(null)
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
  } = useDrawingEngine(canvasRef, shadowRef, { maxPages, onChange, onError: handleEngineError })

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

  const askConfirm = useCallback((action: 'clear' | 'delete') => {
    if (!pages[currentPage]?.hasContent) {
      if (action === 'delete' && pages.length > 1) runPageAction(deletePage)
      return
    }
    setConfirmAction(action)
  }, [pages, currentPage, deletePage, runPageAction])

  const runConfirmed = () => {
    const action = confirmAction
    setConfirmAction(null)
    if (action === 'clear') clearPage()
    else if (action === 'delete') runPageAction(deletePage)
  }

  const confirmMessage = confirmAction === 'delete' && pages.length > 1
    ? 'تحذف الصفحة ' + (currentPage + 1) + ' وكل ما فيها؟'
    : 'تمسح كل ما كتبته في الصفحة الحالية؟ يمكنك التراجع عن المسح.'

  const editorClass = fullscreenActive
    ? 'fixed inset-0 z-[100] flex h-dvh w-screen flex-col overflow-hidden bg-slate-100 p-2 sm:p-4'
    : 'space-y-3'
  const fullscreenContentClass = fullscreenActive
    ? 'mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-2'
    : 'space-y-3'

  return (
    <div ref={editorRef} className={editorClass} dir="rtl" data-hw-fs={fullscreenActive ? 'true' : 'false'}>
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
          onToolChange={setTool}
          onColorChange={setColor}
          onSizeChange={setBrushSize}
          onUndo={undo}
          onRedo={redo}
          onClear={() => askConfirm('clear')}
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
            <div className={fullscreenActive
              ? 'hw-stage relative min-h-0 flex-1 overflow-hidden bg-slate-100 p-2'
              : 'relative aspect-[5/7] w-full overscroll-contain overflow-hidden bg-white'
            }>
              <div
                className={fullscreenActive
                  ? 'absolute inset-0 m-auto overflow-hidden bg-white shadow-[0_12px_40px_-16px_rgba(15,23,42,0.3)]'
                  : 'absolute inset-0 overflow-hidden'
                }
                style={{
                  ...(fullscreenActive ? { width: stageSize ? stageSize.w : 0, height: stageSize ? stageSize.h : 0 } : {}),
                  backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent calc(100% - 1px), #e2eaf2 calc(100% - 1px), #e2eaf2 100%)',
                  backgroundSize: `100% ${(40 / CANVAS_HEIGHT) * 100}%`,
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
                  style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                  aria-label="مساحة كتابة الإجابة"
                  data-tool={tool}
                />
                <div
                  ref={cursorRef}
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 z-10 rounded-full border border-slate-500/70 bg-slate-400/25 opacity-0"
                />
              </div>
            </div>
          </div>
          <p className={`${fullscreenActive ? 'hidden' : ''} px-1 text-center text-xs text-slate-500`}>
            التراجع والإعادة متاحان لآخر 10 خطوات في كل صفحة
          </p>
        </div>
      </div>
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
