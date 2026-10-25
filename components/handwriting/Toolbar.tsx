'use client'

import { Eraser, Maximize2, Minimize2, PenLine, Redo2, Trash2, Undo2 } from 'lucide-react'
import type { DrawingTool } from './useDrawingEngine'

type Props = {
  tool: DrawingTool
  color: string
  colors: string[]
  size: number
  canUndo: boolean
  canRedo: boolean
  isBusy: boolean
  isFullscreen: boolean
  onToolChange: (tool: DrawingTool) => void
  onColorChange: (color: string) => void
  onSizeChange: (size: number) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onFullscreen: () => void
}

const toolButton = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40'

export function Toolbar({
  tool,
  color,
  colors,
  size,
  canUndo,
  canRedo,
  isBusy,
  isFullscreen,
  onToolChange,
  onColorChange,
  onSizeChange,
  onUndo,
  onRedo,
  onClear,
  onFullscreen,
}: Props) {
  const minSize = tool === 'pen' ? 2 : 12
  const maxSize = tool === 'pen' ? 22 : 96

  return (
    <div className={`${isFullscreen ? 'relative shrink-0' : 'sticky bottom-0 z-20 lg:top-2 lg:bottom-auto'} flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur`}>
      <div className="flex items-center gap-2" role="group" aria-label="أداة الكتابة">
        <button
          type="button"
          onClick={() => onToolChange('pen')}
          aria-pressed={tool === 'pen'}
          className={`${toolButton} ${tool === 'pen' ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          <PenLine className="size-4" aria-hidden />
          قلم
        </button>
        <button
          type="button"
          onClick={() => onToolChange('eraser')}
          aria-pressed={tool === 'eraser'}
          className={`${toolButton} ${tool === 'eraser' ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          <Eraser className="size-4" aria-hidden />
          ممحاة
        </button>
        {tool === 'pen' && (
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-1" aria-label="لون القلم">
            {colors.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => onColorChange(swatch)}
                aria-label={`لون ${swatch}`}
                aria-pressed={color === swatch}
                className={`size-8 rounded-full border-2 transition-transform hover:scale-105 ${color === swatch ? 'border-slate-800 ring-2 ring-white' : 'border-white'}`}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        )}
      </div>

      <label className="flex min-w-36 flex-1 items-center gap-3 px-1 text-xs font-semibold text-slate-600 sm:max-w-52">
        <span className="whitespace-nowrap">{tool === 'pen' ? 'حجم القلم' : 'حجم الممحاة'}</span>
        <input
          type="range"
          min={minSize}
          max={maxSize}
          value={size}
          onChange={(event) => onSizeChange(Number(event.target.value))}
          aria-label={tool === 'pen' ? 'حجم القلم' : 'حجم الممحاة'}
          className="h-2 min-w-16 flex-1 cursor-pointer accent-teal-700"
        />
      </label>

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onUndo} disabled={!canUndo || isBusy} aria-label="تراجع" title="تراجع" className={`${toolButton} border-transparent px-2 text-slate-600 hover:bg-slate-100`}>
          <Undo2 className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo || isBusy} aria-label="إعادة" title="إعادة" className={`${toolButton} border-transparent px-2 text-slate-600 hover:bg-slate-100`}>
          <Redo2 className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onClear} disabled={isBusy} aria-label="مسح الصفحة" title="مسح الصفحة الحالية" className={`${toolButton} border-transparent px-2 text-rose-600 hover:bg-rose-50`}>
          <Trash2 className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onFullscreen} aria-label={isFullscreen ? 'إغلاق ملء الشاشة' : 'ملء الشاشة'} title={isFullscreen ? 'إغلاق ملء الشاشة' : 'ملء الشاشة'} className={`${toolButton} border-slate-200 bg-white px-2 text-slate-600 hover:bg-slate-50`}>
          {isFullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  )
}
