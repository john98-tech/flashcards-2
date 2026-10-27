'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser, Hand, Highlighter, Pen, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Pt = [number, number, number]
type Stroke = { tool: 'pen' | 'hl'; color: string; width: number; pts: Pt[] }
type Page = Stroke[]
type Bg = 'blank' | 'lines' | 'grid'
type Tool = 'pen' | 'hl' | 'eraser' | 'hand'

const W = 1000
const H = 1414
const COLORS = ['#111111', '#1d4ed8', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777']
const WIDTHS = [2, 4, 7, 12]

export type InkHandle = { hasInk: () => boolean; exportImages: () => { mimeType: string; data: string }[] }

function paint(ctx: CanvasRenderingContext2D, s: Stroke, from = 1) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = s.color
  ctx.globalAlpha = s.tool === 'hl' ? 0.35 : 1
  if (s.pts.length === 1) {
    ctx.beginPath()
    ctx.arc(s.pts[0][0], s.pts[0][1], s.width / 2, 0, Math.PI * 2)
    ctx.fillStyle = s.color
    ctx.fill()
  }
  for (let i = Math.max(1, from); i < s.pts.length; i++) {
    const a = s.pts[i - 1]
    const b = s.pts[i]
    ctx.lineWidth = s.width * (s.tool === 'hl' ? 1 : 0.55 + (a[2] + b[2]) * 0.5)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawBg(ctx: CanvasRenderingContext2D, bg: Bg) {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#dbe3ee'
  ctx.lineWidth = 1
  if (bg === 'blank') return
  for (let y = 70; y < H; y += 50) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  if (bg === 'grid')
    for (let x = 50; x < W; x += 50) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
}

function render(canvas: HTMLCanvasElement, strokes: Page, bg: Bg | null, scale = 1) {
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  if (bg) drawBg(ctx, bg)
  else {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
  }
  for (const s of strokes) paint(ctx, s)
}

export const InkPad = forwardRef<InkHandle, { storageKey: string; active: boolean }>(function InkPad({ storageKey, active }, ref) {
  const [pages, setPages] = useState<Page[]>([[]])
  const [bg, setBg] = useState<Bg>('lines')
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [palm, setPalm] = useState(true)
  const [past, setPast] = useState<Page[][]>([])
  const [future, setFuture] = useState<Page[][]>([])
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])
  const pagesRef = useRef(pages)
  const live = useRef<{ page: number; stroke: Stroke; drawn: number; id: number } | null>(null)
  const erasing = useRef<{ page: number; id: number; changed: boolean } | null>(null)
  const sawPen = useRef(false)
  pagesRef.current = pages

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const v = JSON.parse(raw)
        if (Array.isArray(v.pages) && v.pages.length) setPages(v.pages)
        if (v.bg) setBg(v.bg)
      }
    } catch {}
  }, [storageKey])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ pages, bg }))
      } catch {}
    }, 500)
    return () => clearTimeout(t)
  }, [pages, bg, storageKey])

  const redraw = useCallback((i: number, p = pagesRef.current) => {
    const c = canvases.current[i]
    if (c) render(c, p[i] ?? [], bg)
  }, [bg])

  useEffect(() => {
    pages.forEach((_, i) => redraw(i, pages))
  }, [pages, bg, redraw, active])

  useImperativeHandle(ref, () => ({
    hasInk: () => pagesRef.current.some((p) => p.length > 0),
    exportImages: () =>
      pagesRef.current
        .filter((p) => p.length > 0)
        .map((p) => {
          const c = document.createElement('canvas')
          render(c, p, null, 1.2)
          return { mimeType: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] }
        }),
  }))

  const commit = (next: Page[]) => {
    setPast((h) => [...h.slice(-40), pagesRef.current])
    setFuture([])
    setPages(next)
  }

  const pos = (e: React.PointerEvent, i: number): Pt => {
    const r = canvases.current[i]!.getBoundingClientRect()
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, pressure]
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>, i: number) => {
    if (tool === 'hand') return
    if (e.pointerType === 'pen') sawPen.current = true
    if (palm && sawPen.current && e.pointerType === 'touch') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pos(e, i)
    if (tool === 'eraser') {
      erasing.current = { page: i, id: e.pointerId, changed: false }
      erase(i, p)
      return
    }
    live.current = { page: i, id: e.pointerId, drawn: 1, stroke: { tool, color, width: tool === 'hl' ? width * 3 : width, pts: [p] } }
    const ctx = canvases.current[i]!.getContext('2d')!
    ctx.setTransform(canvases.current[i]!.width / W, 0, 0, canvases.current[i]!.height / H, 0, 0)
    paint(ctx, live.current.stroke)
  }

  const erase = (i: number, p: Pt) => {
    const r = 18 + width * 2
    const page = pagesRef.current[i]
    const keep = page.filter((s) => !s.pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < r))
    if (keep.length !== page.length) {
      const next = pagesRef.current.map((pg, k) => (k === i ? keep : pg))
      pagesRef.current = next
      if (erasing.current) erasing.current.changed = true
      redraw(i, next)
    }
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>, i: number) => {
    if (erasing.current?.id === e.pointerId) return erase(i, pos(e, i))
    const l = live.current
    if (!l || l.id !== e.pointerId) return
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
    const r = canvases.current[i]!.getBoundingClientRect()
    for (const ev of events) {
      const pr = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5
      l.stroke.pts.push([((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H, pr])
    }
    const ctx = canvases.current[i]!.getContext('2d')!
    ctx.setTransform(canvases.current[i]!.width / W, 0, 0, canvases.current[i]!.height / H, 0, 0)
    paint(ctx, l.stroke, l.drawn)
    l.drawn = l.stroke.pts.length
  }

  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (erasing.current?.id === e.pointerId) {
      const { changed } = erasing.current
      erasing.current = null
      if (changed) {
        const next = pagesRef.current
        setPast((h) => [...h.slice(-40), pages])
        setFuture([])
        setPages(next)
      }
      return
    }
    const l = live.current
    if (!l || l.id !== e.pointerId) return
    live.current = null
    commit(pagesRef.current.map((pg, k) => (k === l.page ? [...pg, l.stroke] : pg)))
  }

  const undo = () => {
    if (!past.length) return
    setFuture((f) => [pagesRef.current, ...f])
    setPages(past[past.length - 1])
    setPast(past.slice(0, -1))
  }
  const redo = () => {
    if (!future.length) return
    setPast((h) => [...h, pagesRef.current])
    setPages(future[0])
    setFuture(future.slice(1))
  }
  const clearAll = () => {
    if (pages.some((p) => p.length) && confirm('تمسح كل اللي اترسم في كل الصفحات؟')) commit([[]])
  }

  const T = ({ id, label, children }: { id: Tool; label: string; children: React.ReactNode }) => (
    <button type="button" aria-label={label} title={label} aria-pressed={tool === id} onClick={() => setTool(id)}
      className={cn('flex size-9 items-center justify-center rounded-lg', tool === id ? 'bg-primary text-primary-foreground' : 'text-neutral-600 hover:bg-neutral-100')}>
      {children}
    </button>
  )
  const B = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="flex size-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-35">
      {children}
    </button>
  )

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', !active && 'hidden')}>
      <div className="z-20 flex shrink-0 flex-wrap items-center gap-1 border-b bg-white px-2 py-1.5" dir="ltr">
        <T id="pen" label="قلم"><Pen className="size-[18px]" /></T>
        <T id="hl" label="هايلايتر"><Highlighter className="size-[18px]" /></T>
        <T id="eraser" label="ممحاة"><Eraser className="size-[18px]" /></T>
        <T id="hand" label="تمرير (إيد)"><Hand className="size-[18px]" /></T>
        <span className="mx-1 h-6 w-px bg-neutral-200" />
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={`لون ${c}`} onClick={() => { setColor(c); if (tool === 'eraser' || tool === 'hand') setTool('pen') }}
            style={{ background: c }} className={cn('size-6 rounded-full border-2', color === c ? 'border-primary ring-2 ring-primary/30' : 'border-white shadow')} />
        ))}
        <span className="mx-1 h-6 w-px bg-neutral-200" />
        {WIDTHS.map((w) => (
          <button key={w} type="button" aria-label={`سمك ${w}`} onClick={() => setWidth(w)}
            className={cn('flex size-9 items-center justify-center rounded-lg', width === w ? 'bg-neutral-200' : 'hover:bg-neutral-100')}>
            <span className="rounded-full bg-neutral-800" style={{ width: w + 4, height: w + 4 }} />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-neutral-200" />
        <B label="تراجع" onClick={undo} disabled={!past.length}><Undo2 className="size-[18px]" /></B>
        <B label="إعادة" onClick={redo} disabled={!future.length}><Redo2 className="size-[18px]" /></B>
        <B label="امسح كل حاجة" onClick={clearAll}><Trash2 className="size-[18px]" /></B>
        <B label="صفحة جديدة" onClick={() => commit([...pages, []])}><Plus className="size-[18px]" /></B>
        <select value={bg} onChange={(e) => setBg(e.target.value as Bg)} aria-label="خلفية الصفحة" className="h-9 rounded-lg border bg-white px-2 text-xs">
          <option value="blank">سادة</option>
          <option value="lines">سطور</option>
          <option value="grid">مربعات</option>
        </select>
        <label className="ms-1 flex cursor-pointer items-center gap-1 text-xs text-neutral-600">
          <input type="checkbox" checked={palm} onChange={(e) => setPalm(e.target.checked)} className="accent-primary" /> تجاهل راحة الإيد
        </label>
      </div>

      <div className="flex-1 overflow-y-auto bg-neutral-200/70 px-0 py-0 sm:px-4 sm:py-6">
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
          {pages.map((_, i) => (
            <canvas key={i} ref={(el) => { canvases.current[i] = el }}
              onPointerDown={(e) => down(e, i)} onPointerMove={(e) => move(e, i)} onPointerUp={up} onPointerCancel={up}
              style={{ aspectRatio: `${W} / ${H}`, touchAction: tool === 'hand' ? 'pan-y pinch-zoom' : 'none', cursor: tool === 'hand' ? 'grab' : tool === 'eraser' ? 'cell' : 'crosshair' }}
              className="w-full bg-white shadow-md sm:rounded-sm" />
          ))}
          <p className="pb-6 text-center text-xs text-neutral-500">صفحة {pages.length} · دوس + فوق لإضافة صفحة</p>
        </div>
      </div>
    </div>
  )
})
