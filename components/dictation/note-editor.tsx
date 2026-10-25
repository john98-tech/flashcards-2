'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  Circle,
  Eraser,
  GripHorizontal,
  Hand,
  Highlighter,
  Minus,
  Pen,
  Pencil,
  Plus,
  Redo2,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Student page of written dictation: a notebook-style page that shows the lesson text the admin
 * wrote, with a pen / pencil / highlighter / eraser / shapes toolbar and keyboard text boxes on top.
 * Pure canvas + pointer events (stylus, finger and mouse); no extra dependencies.
 */

type Tool = 'pen' | 'pencil' | 'marker' | 'eraser' | 'shape' | 'text' | 'pan'
type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse'
type Pt = { x: number; y: number; p: number }
type Stroke = { id: string; kind: 'stroke'; tool: 'pen' | 'pencil' | 'marker'; color: string; size: number; points: Pt[] }
type Shape = { id: string; kind: 'shape'; shape: ShapeKind; color: string; size: number; x1: number; y1: number; x2: number; y2: number }
type TextItem = { id: string; kind: 'text'; x: number; y: number; w: number; text: string; color: string; size: number }
type Item = Stroke | Shape | TextItem
type Drawable = Stroke | Shape

const COLORS = ['#111827', '#1d4ed8', '#dc2626', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#db2777']
const uid = () => Math.random().toString(36).slice(2, 10)
const fontSizeOf = (size: number) => 14 + size * 2

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

function paint(ctx: CanvasRenderingContext2D, item: Drawable) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = item.color
  ctx.fillStyle = item.color

  if (item.kind === 'shape') {
    ctx.globalAlpha = 1
    ctx.lineWidth = item.size
    const { x1, y1, x2, y2 } = item
    ctx.beginPath()
    if (item.shape === 'rect') ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
    else if (item.shape === 'ellipse') {
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2)
    } else {
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      if (item.shape === 'arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const head = Math.max(12, item.size * 4)
        for (const side of [-1, 1]) {
          ctx.moveTo(x2, y2)
          ctx.lineTo(x2 - head * Math.cos(angle + side * 0.45), y2 - head * Math.sin(angle + side * 0.45))
        }
      }
    }
    ctx.stroke()
    return
  }

  const pts = item.points
  if (!pts.length) return

  if (item.tool === 'pen') {
    ctx.globalAlpha = 1
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, (item.size * (0.5 + pts[0].p)) / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = item.size * (0.5 + (pts[i].p + pts[i - 1].p) / 2)
      ctx.beginPath()
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
      ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }
    return
  }

  // pencil / marker: a single path so the alpha does not pile up inside one stroke
  const marker = item.tool === 'marker'
  ctx.globalAlpha = marker ? 0.35 : 0.8
  ctx.lineWidth = marker ? item.size * 3.5 : Math.max(1, item.size * 0.7)
  if (marker) ctx.lineCap = 'square'
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Eraser hit testing
// ---------------------------------------------------------------------------

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function hits(item: Item, x: number, y: number, r: number) {
  if (item.kind === 'text') return false
  if (item.kind === 'stroke') {
    const reach = r + (item.tool === 'marker' ? item.size * 1.75 : item.size / 2)
    const pts = item.points
    if (pts.length === 1) return Math.hypot(pts[0].x - x, pts[0].y - y) <= reach
    for (let i = 1; i < pts.length; i++) {
      if (distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= reach) return true
    }
    return false
  }
  const reach = r + item.size / 2
  const { x1, y1, x2, y2 } = item
  if (item.shape === 'line' || item.shape === 'arrow') return distToSegment(x, y, x1, y1, x2, y2) <= reach
  if (item.shape === 'rect') {
    const l = Math.min(x1, x2)
    const rt = Math.max(x1, x2)
    const t = Math.min(y1, y2)
    const b = Math.max(y1, y2)
    return (
      distToSegment(x, y, l, t, rt, t) <= reach ||
      distToSegment(x, y, rt, t, rt, b) <= reach ||
      distToSegment(x, y, rt, b, l, b) <= reach ||
      distToSegment(x, y, l, b, l, t) <= reach
    )
  }
  const rx = Math.max(1, Math.abs(x2 - x1) / 2)
  const ry = Math.max(1, Math.abs(y2 - y1) / 2)
  const nx = (x - (x1 + x2) / 2) / rx
  const ny = (y - (y1 + y2) / 2) / ry
  return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry) <= reach
}

// ---------------------------------------------------------------------------
// Lesson text (what the admin wrote)
// ---------------------------------------------------------------------------

type Block = { type: 'p'; text: string } | { type: 'table'; rows: string[][] }

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].trim().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells)
        i++
      }
      if (rows.length) blocks.push({ type: 'table', rows })
      continue
    }
    blocks.push({ type: 'p', text: lines[i] })
    i++
  }
  return blocks
}

function LessonText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text])
  if (!text.trim()) return <div className="h-24" />
  return (
    <div className="flex flex-col text-[19px] leading-[2.1]">
      {blocks.map((block, index) =>
        block.type === 'table' ? (
          <div key={index} className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-[17px]">
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => {
                      const Cell = r === 0 ? 'th' : 'td'
                      return (
                        <Cell key={c} dir="auto" className="border border-neutral-400 px-3 py-1.5 text-start align-top font-normal first-line:font-normal">
                          {cell}
                        </Cell>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : block.text.trim() ? (
          <p key={index} dir="auto" className="whitespace-pre-wrap">
            {block.text}
          </p>
        ) : (
          <div key={index} className="h-4" />
        ),
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function ToolButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-foreground/80 transition-colors hover:bg-accent disabled:opacity-35 [&_svg]:size-5',
        active && 'border-primary/40 bg-accent text-primary',
      )}
    >
      {children}
    </button>
  )
}

const Divider = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />

export function NoteEditor({ lessonTitle, subjectName, text }: { lessonTitle: string; subjectName: string; text: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [past, setPast] = useState<Item[][]>([])
  const [future, setFuture] = useState<Item[][]>([])
  const [tool, setTool] = useState<Tool>('pen')
  const [shape, setShape] = useState<ShapeKind>('rect')
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(3)
  const [penOnly, setPenOnly] = useState(false)
  const [extra, setExtra] = useState(700)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  const itemsRef = useRef<Item[]>([])
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<Drawable | null>(null)
  const activeRef = useRef<number | null>(null)
  const eraseSnapshot = useRef<Item[] | null>(null)
  const frameRef = useRef(0)
  const boxRef = useRef(box)
  boxRef.current = box

  const apply = useCallback((next: Item[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  const commit = useCallback(
    (next: Item[]) => {
      const before = itemsRef.current
      setPast((p) => [...p.slice(-99), before])
      setFuture([])
      apply(next)
    },
    [apply],
  )

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      const prev = p[p.length - 1]
      setFuture((f) => [itemsRef.current, ...f])
      apply(prev)
      return p.slice(0, -1)
    })
  }, [apply])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      const [next, ...rest] = f
      setPast((p) => [...p, itemsRef.current])
      apply(next)
      return rest
    })
  }, [apply])

  // ---- canvas size follows the page (text height + writing space) ----
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const update = () => setBox({ w: page.clientWidth, h: page.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(page)
    return () => observer.disconnect()
  }, [])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, boxRef.current.w, boxRef.current.h)
    for (const item of itemsRef.current) if (item.kind !== 'text') paint(ctx, item)
    if (liveRef.current) paint(ctx, liveRef.current)
  }, [])

  const scheduleRedraw = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      redraw()
    })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !box.w || !box.h) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(box.w * dpr)
    canvas.height = Math.round(box.h * dpr)
    redraw()
  }, [box, redraw])

  useEffect(() => {
    redraw()
  }, [items, redraw])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  // ---- keyboard shortcuts (undo / redo) when not typing in a text box ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ---- pointer drawing ----
  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const rect = e.currentTarget.getBoundingClientRect()
    const p = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, p }
  }

  const eraseAt = (pt: Pt) => {
    const radius = 6 + size * 1.5
    const next = itemsRef.current.filter((item) => !hits(item, pt.x, pt.y, radius))
    if (next.length !== itemsRef.current.length) apply(next)
  }

  const addText = (pt: Pt) => {
    const w = Math.max(140, Math.min(300, boxRef.current.w - pt.x - 8))
    const item: TextItem = { id: uid(), kind: 'text', x: Math.max(0, pt.x), y: Math.max(0, pt.y - 10), w, text: '', color, size }
    commit([...itemsRef.current, item])
    setFocusId(item.id)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') return
    if (e.pointerType === 'touch' && penOnly) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (activeRef.current !== null) return
    const pt = pointOf(e)
    if (tool === 'text') {
      e.preventDefault()
      addText(pt)
      return
    }
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    activeRef.current = e.pointerId
    if (tool === 'eraser') {
      eraseSnapshot.current = itemsRef.current
      eraseAt(pt)
      return
    }
    if (tool === 'shape') {
      liveRef.current = { id: 'live', kind: 'shape', shape, color, size, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y }
    } else {
      liveRef.current = { id: 'live', kind: 'stroke', tool, color, size, points: [pt] }
    }
    scheduleRedraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeRef.current !== e.pointerId) return
    if (tool === 'eraser') {
      eraseAt(pointOf(e))
      return
    }
    const live = liveRef.current
    if (!live) return
    if (live.kind === 'shape') {
      const pt = pointOf(e)
      live.x2 = pt.x
      live.y2 = pt.y
    } else {
      const native = e.nativeEvent
      const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
      const rect = e.currentTarget.getBoundingClientRect()
      const list = events.length ? events : [native]
      for (const ev of list) {
        const p = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5
        live.points.push({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, p })
      }
    }
    scheduleRedraw()
  }

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeRef.current !== e.pointerId) return
    activeRef.current = null
    if (tool === 'eraser') {
      const snapshot = eraseSnapshot.current
      eraseSnapshot.current = null
      if (snapshot && snapshot !== itemsRef.current) {
        setPast((p) => [...p.slice(-99), snapshot])
        setFuture([])
      }
      return
    }
    const live = liveRef.current
    liveRef.current = null
    if (!live) return
    if (live.kind === 'shape' && Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < 4) {
      redraw()
      return
    }
    commit([...itemsRef.current, { ...live, id: uid() }])
  }

  // ---- text boxes ----
  const patchText = (id: string, patch: Partial<TextItem>) =>
    apply(itemsRef.current.map((it) => (it.kind === 'text' && it.id === id ? { ...it, ...patch } : it)))

  const removeItem = (id: string) => commit(itemsRef.current.filter((it) => it.id !== id))

  // Toolbar color / size also restyle the text box being edited.
  useEffect(() => {
    if (!focusId) return
    apply(itemsRef.current.map((it) => (it.kind === 'text' && it.id === focusId ? { ...it, color, size } : it)))
  }, [color, size, focusId, apply])

  const clearAll = () => {
    if (!items.length) return
    if (confirm('تمسح كل اللي كتبته ورسمته؟')) commit([])
  }

  const canvasCursor =
    tool === 'pan' ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair'
  const touchAction = tool === 'pan' || (penOnly && tool !== 'text') ? 'pan-y' : 'none'
  const textBoxes = items.filter((it): it is TextItem => it.kind === 'text')

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40" dir="rtl">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-3 py-2">
          <Link
            href="/#dictation"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="رجوع"
          >
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold" dir="auto">{lessonTitle}</h1>
            {subjectName && <p className="truncate text-xs text-muted-foreground" dir="auto">{subjectName}</p>}
          </div>
          <button
            type="button"
            data-ai-correct-btn
            className="ms-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Sparkles className="size-4" aria-hidden />
            صحّح بالذكاء الاصطناعي
          </button>
        </div>

        <div className="mx-auto w-full max-w-5xl overflow-x-auto px-3 pb-2" dir="ltr">
          <div className="flex w-max items-center gap-0.5">
            <ToolButton title="قلم" active={tool === 'pen'} onClick={() => setTool('pen')}>
              <Pen />
            </ToolButton>
            <ToolButton title="قلم رصاص" active={tool === 'pencil'} onClick={() => setTool('pencil')}>
              <Pencil />
            </ToolButton>
            <ToolButton title="هايلايتر" active={tool === 'marker'} onClick={() => setTool('marker')}>
              <Highlighter />
            </ToolButton>
            <ToolButton title="ممحاة" active={tool === 'eraser'} onClick={() => setTool('eraser')}>
              <Eraser />
            </ToolButton>
            <ToolButton title="أشكال" active={tool === 'shape'} onClick={() => setTool('shape')}>
              <Square />
            </ToolButton>
            <ToolButton title="كتابة بالكيبورد" active={tool === 'text'} onClick={() => setTool('text')}>
              <Type />
            </ToolButton>
            <ToolButton title="تحريك الصفحة" active={tool === 'pan'} onClick={() => setTool('pan')}>
              <Hand />
            </ToolButton>
            <Divider />
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`لون ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', color === c && 'ring-2 ring-primary ring-offset-2 ring-offset-card')}
              >
                <span className="size-5 rounded-full border border-black/10" style={{ backgroundColor: c }} />
              </button>
            ))}
            <label className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full" title="لون مخصص">
              <span
                className="size-5 rounded-full border border-black/10"
                style={{ background: 'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)' }}
              />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                aria-label="لون مخصص"
              />
            </label>
            <Divider />
            <input
              type="range"
              min={1}
              max={24}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="mx-1 w-24 shrink-0 accent-[var(--color-primary,currentColor)]"
              aria-label="سُمك القلم"
              title="السُمك"
            />
            <span className="w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{size}</span>
            <Divider />
            <ToolButton title="تراجع" disabled={!past.length} onClick={undo}>
              <Undo2 />
            </ToolButton>
            <ToolButton title="إعادة" disabled={!future.length} onClick={redo}>
              <Redo2 />
            </ToolButton>
            <ToolButton title="مسح الكل" disabled={!items.length} onClick={clearAll}>
              <Trash2 />
            </ToolButton>
            <Divider />
            <button
              type="button"
              aria-pressed={penOnly}
              onClick={() => setPenOnly((v) => !v)}
              title="الرسم بقلم الشاشة فقط، والإصبع يحرّك الصفحة"
              className={cn(
                'shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent',
                penOnly ? 'border-primary/40 bg-accent text-primary' : 'border-transparent text-foreground/80',
              )}
            >
              قلم الشاشة فقط
            </button>
          </div>

          {tool === 'shape' && (
            <div className="mt-1 flex w-max items-center gap-0.5 rounded-lg border bg-background p-0.5">
              <ToolButton title="خط" active={shape === 'line'} onClick={() => setShape('line')}>
                <Minus />
              </ToolButton>
              <ToolButton title="سهم" active={shape === 'arrow'} onClick={() => setShape('arrow')}>
                <ArrowUpRight />
              </ToolButton>
              <ToolButton title="مستطيل" active={shape === 'rect'} onClick={() => setShape('rect')}>
                <Square />
              </ToolButton>
              <ToolButton title="دايرة" active={shape === 'ellipse'} onClick={() => setShape('ellipse')}>
                <Circle />
              </ToolButton>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-2 py-4 sm:px-4 sm:py-6">
        <div ref={pageRef} dir="ltr" className="relative overflow-hidden rounded-xl border bg-white text-neutral-900 shadow-sm">
          <div className="px-5 pt-7 sm:px-10">
            <LessonText text={text} />
          </div>
          <div style={{ height: extra }} aria-hidden />

          <canvas
            ref={canvasRef}
            className="absolute inset-0 size-full"
            style={{ cursor: canvasCursor, touchAction }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
          />

          <div className="pointer-events-none absolute inset-0">
            {textBoxes.map((item) => (
              <TextBox
                key={item.id}
                item={item}
                editable={tool === 'text'}
                autoFocus={item.id === focusId}
                onFocus={() => setFocusId(item.id)}
                onChange={(value) => patchText(item.id, { text: value })}
                onBlur={() => {
                  setFocusId((current) => (current === item.id ? null : current))
                  const current = itemsRef.current.find((it) => it.id === item.id)
                  if (current && current.kind === 'text' && !current.text.trim()) apply(itemsRef.current.filter((it) => it.id !== item.id))
                }}
                onMove={(x, y) => patchText(item.id, { x, y })}
                onMoveEnd={(snapshot) => {
                  if (snapshot !== itemsRef.current) {
                    setPast((p) => [...p.slice(-99), snapshot])
                    setFuture([])
                  }
                }}
                getItems={() => itemsRef.current}
                onRemove={() => removeItem(item.id)}
                pageWidth={box.w}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExtra((v) => v + 600)}
            className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4" aria-hidden /> زوّد مساحة الكتابة
          </button>
        </div>
      </main>
    </div>
  )
}

function TextBox({
  item,
  editable,
  autoFocus,
  pageWidth,
  onFocus,
  onChange,
  onBlur,
  onMove,
  onMoveEnd,
  getItems,
  onRemove,
}: {
  item: TextItem
  editable: boolean
  autoFocus: boolean
  pageWidth: number
  onFocus: () => void
  onChange: (value: string) => void
  onBlur: () => void
  onMove: (x: number, y: number) => void
  onMoveEnd: (snapshot: Item[]) => void
  getItems: () => Item[]
  onRemove: () => void
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const drag = useRef<{ id: number; dx: number; dy: number; snapshot: Item[] } | null>(null)

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus()
    // only when the box is created
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [item.text, item.size, item.w])

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, dx: e.clientX - item.x, dy: e.clientY - item.y, snapshot: getItems() }
  }
  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    onMove(Math.max(0, Math.min(pageWidth - 40, e.clientX - d.dx)), Math.max(0, e.clientY - d.dy))
  }
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    onMoveEnd(d.snapshot)
  }

  return (
    <div
      className={cn('absolute', editable ? 'pointer-events-auto' : 'pointer-events-none')}
      style={{ left: item.x, top: item.y, width: item.w }}
    >
      {editable && (
        <div className="absolute -top-6 start-0 flex h-6 items-center gap-1 rounded-t-md bg-primary/90 px-1 text-primary-foreground" dir="ltr">
          <div
            className="flex h-full cursor-move touch-none items-center px-1"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title="اسحب لتحريك الصندوق"
          >
            <GripHorizontal className="size-4" aria-hidden />
          </div>
          <button type="button" onClick={onRemove} className="flex h-full items-center px-1" aria-label="احذف الصندوق" title="احذف">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      <textarea
        ref={areaRef}
        value={item.text}
        dir="auto"
        rows={1}
        readOnly={!editable}
        tabIndex={editable ? 0 : -1}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        placeholder="اكتب هنا…"
        spellCheck={false}
        className={cn(
          'block w-full resize-none overflow-hidden bg-transparent p-1 leading-[1.6] outline-none',
          editable ? 'rounded-sm border border-dashed border-primary/60' : 'border border-transparent',
        )}
        style={{ color: item.color, fontSize: fontSizeOf(item.size) }}
      />
    </div>
  )
}
