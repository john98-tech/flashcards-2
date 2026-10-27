'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, ChevronDown, Highlighter, Italic, List, ListOrdered,
  Minus, PilcrowLeft, PilcrowRight, Plus, Quote, Redo2, RemoveFormatting, Strikethrough, Table2, Underline, Undo2, UnfoldVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_FONT_SIZE, FONT_FAMILIES, FONT_SIZES, HIGHLIGHT_COLORS, LINE_HEIGHTS, TEXT_COLORS } from '@/components/recite/fonts'

const HEADINGS = [
  { label: 'نص عادي', level: 0, cls: 'text-sm' },
  { label: 'عنوان كبير', level: 1, cls: 'text-xl font-bold' },
  { label: 'عنوان', level: 2, cls: 'text-lg font-bold' },
  { label: 'عنوان فرعي', level: 3, cls: 'text-base font-bold' },
] as const

function Btn({ label, active, disabled, onClick, className, children }: { label: string; active?: boolean; disabled?: boolean; onClick?: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-30', active && 'bg-primary/10 text-primary', className)}
    >
      {children}
    </button>
  )
}

const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-neutral-200" aria-hidden />

/** Dropdown anchored to a button. Fixed-positioned so the scrolling toolbar never clips it. */
function Pop({ label, active, trigger, width = 224, children }: { label: string; active?: boolean; trigger: ReactNode; width?: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect()
      const w = Math.min(width, window.innerWidth - 16)
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) })
    }
    setOpen((v) => !v)
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className={cn('flex h-9 shrink-0 items-center gap-1 rounded-lg px-1.5 text-neutral-700 transition-colors hover:bg-neutral-100', (active || open) && 'bg-primary/10 text-primary')}
      >
        {trigger}
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </button>
      {open && (
        <div
          ref={panel}
          dir="rtl"
          style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16) }}
          onMouseDown={(e) => {
            if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
          }}
          className="fixed z-50 max-h-[60dvh] overflow-y-auto rounded-xl border bg-white p-2 text-neutral-800 shadow-xl"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  )
}

function Swatches({ colors, current, onPick, ring }: { colors: string[]; current?: string | null; onPick: (c: string) => void; ring?: boolean }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          title={c}
          onClick={() => onPick(c)}
          style={{ backgroundColor: c }}
          className={cn('size-6 rounded-full border border-black/15', current?.toLowerCase() === c && 'ring-2 ring-primary ring-offset-1', ring && 'rounded-md')}
        />
      ))}
    </div>
  )
}

function MenuItem({ children, onClick, active, danger, disabled }: { children: ReactNode; onClick: () => void; active?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm hover:bg-neutral-100 disabled:opacity-30', active && 'bg-primary/10 text-primary', danger && 'text-destructive')}
    >
      {children}
    </button>
  )
}

function TableGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ r: 3, c: 3 })
  return (
    <div dir="ltr">
      <div className="grid grid-cols-6 gap-1" onPointerLeave={() => setHover({ r: 0, c: 0 })}>
        {Array.from({ length: 36 }, (_, i) => {
          const r = Math.floor(i / 6) + 1
          const c = (i % 6) + 1
          return (
            <button
              key={i}
              type="button"
              aria-label={`${r} × ${c}`}
              onPointerEnter={() => setHover({ r, c })}
              onClick={() => onPick(r, c)}
              className={cn('size-7 rounded-sm border', r <= hover.r && c <= hover.c ? 'border-primary bg-primary/20' : 'border-neutral-300')}
            />
          )
        })}
      </div>
      <p className="mt-2 text-center text-xs text-neutral-500">{hover.r ? `${hover.r} صفوف × ${hover.c} أعمدة` : 'اختار حجم الجدول'}</p>
    </div>
  )
}

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null
      const ts = editor.getAttributes('textStyle')
      const heading = editor.isActive('heading') ? (editor.getAttributes('heading').level as number) : 0
      const para = editor.isActive('heading') ? 'heading' : 'paragraph'
      return {
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        color: (ts.color as string | undefined) ?? null,
        highlight: (editor.getAttributes('highlight').color as string | undefined) ?? null,
        isHighlight: editor.isActive('highlight'),
        fontFamily: (ts.fontFamily as string | undefined) ?? null,
        fontSize: ts.fontSize ? parseInt(ts.fontSize as string, 10) : DEFAULT_FONT_SIZE,
        lineHeight: (ts.lineHeight as string | undefined) ?? null,
        heading,
        bullet: editor.isActive('bulletList'),
        ordered: editor.isActive('orderedList'),
        quote: editor.isActive('blockquote'),
        align: ['left', 'center', 'right', 'justify'].find((a) => editor.isActive({ textAlign: a })) ?? null,
        dir: (editor.getAttributes(para).dir as string | undefined) ?? null,
        inTable: editor.isActive('table'),
      }
    },
  })

  if (!editor || !s) return <div className="h-[92px] shrink-0 border-b bg-white" aria-hidden />

  const run = () => editor.chain().focus()
  const sizeStep = (dir: 1 | -1) => {
    const list = FONT_SIZES
    const next = dir > 0 ? list.find((n) => n > s.fontSize) ?? list[list.length - 1] : [...list].reverse().find((n) => n < s.fontSize) ?? list[0]
    run().setFontSize(`${next}px`).run()
  }
  const setDir = (dir: 'rtl' | 'ltr') => {
    const chain = run()
    for (const t of ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList']) chain.updateAttributes(t, { dir })
    chain.run()
  }
  const fontLabel = FONT_FAMILIES.find((f) => f.value === s.fontFamily)?.label ?? 'الافتراضي'
  const headingLabel = HEADINGS.find((h) => h.level === s.heading)?.label ?? 'نص عادي'
  const AlignIcon = s.align === 'center' ? AlignCenter : s.align === 'right' ? AlignRight : s.align === 'justify' ? AlignJustify : AlignLeft

  return (
    <div className="relative z-20 shrink-0 border-b bg-white">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)' }} aria-hidden />
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1 lg:flex-wrap">
        <Btn label="تراجع" disabled={!s.canUndo} onClick={() => run().undo().run()}><Undo2 className="size-4" aria-hidden /></Btn>
        <Btn label="إعادة" disabled={!s.canRedo} onClick={() => run().redo().run()}><Redo2 className="size-4" aria-hidden /></Btn>
        <Sep />

        <Pop label="نوع الخط" width={220} trigger={<span className="max-w-24 truncate text-sm" style={{ fontFamily: s.fontFamily ?? undefined }}>{fontLabel}</span>}>
          {(close) => FONT_FAMILIES.map((f) => (
            <MenuItem key={f.label} active={f.value === s.fontFamily} onClick={() => { (f.value ? run().setFontFamily(f.value) : run().unsetFontFamily()).run(); close() }}>
              <span style={{ fontFamily: f.value ?? undefined }} dir="ltr">{f.label}</span>
            </MenuItem>
          ))}
        </Pop>

        <div className="flex shrink-0 items-center rounded-lg border">
          <Btn label="تصغير الخط" onClick={() => sizeStep(-1)}><Minus className="size-3.5" aria-hidden /></Btn>
          <Pop label="حجم الخط" width={120} trigger={<span className="min-w-6 text-center text-sm tabular-nums">{s.fontSize}</span>}>
            {(close) => FONT_SIZES.map((n) => (
              <MenuItem key={n} active={n === s.fontSize} onClick={() => { run().setFontSize(`${n}px`).run(); close() }}>{n}</MenuItem>
            ))}
          </Pop>
          <Btn label="تكبير الخط" onClick={() => sizeStep(1)}><Plus className="size-3.5" aria-hidden /></Btn>
        </div>
        <Sep />

        <Btn label="عريض" active={s.bold} onClick={() => run().toggleBold().run()}><Bold className="size-4" aria-hidden /></Btn>
        <Btn label="مائل" active={s.italic} onClick={() => run().toggleItalic().run()}><Italic className="size-4" aria-hidden /></Btn>
        <Btn label="تحته خط" active={s.underline} onClick={() => run().toggleUnderline().run()}><Underline className="size-4" aria-hidden /></Btn>
        <Btn label="يتوسطه خط" active={s.strike} onClick={() => run().toggleStrike().run()}><Strikethrough className="size-4" aria-hidden /></Btn>
        <Sep />

        <Pop label="لون النص" width={256} trigger={<span className="flex flex-col items-center"><Baseline className="size-4" aria-hidden /><span className="-mt-0.5 h-1 w-4 rounded-full" style={{ backgroundColor: s.color ?? '#000' }} /></span>}>
          {(close) => (
            <div className="space-y-2">
              <Swatches colors={TEXT_COLORS} current={s.color} onPick={(c) => { run().setColor(c).run(); close() }} />
              <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs">
                <label className="flex items-center gap-2">لون مخصص <input type="color" aria-label="لون مخصص" value={s.color ?? '#000000'} onChange={(e) => run().setColor(e.target.value).run()} className="size-7 cursor-pointer rounded border bg-transparent p-0" /></label>
                <button type="button" onClick={() => { run().unsetColor().run(); close() }} className="rounded-md px-2 py-1 hover:bg-neutral-100">الافتراضي</button>
              </div>
            </div>
          )}
        </Pop>

        <Pop label="هايلايت" active={s.isHighlight} width={256} trigger={<span className="flex flex-col items-center"><Highlighter className="size-4" aria-hidden /><span className="-mt-0.5 h-1 w-4 rounded-full" style={{ backgroundColor: s.highlight ?? '#fff176' }} /></span>}>
          {(close) => (
            <div className="space-y-2">
              <Swatches colors={HIGHLIGHT_COLORS} current={s.highlight} ring onPick={(c) => { run().setHighlight({ color: c }).run(); close() }} />
              <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs">
                <label className="flex items-center gap-2">لون مخصص <input type="color" aria-label="لون هايلايت مخصص" value={s.highlight ?? '#fff176'} onChange={(e) => run().setHighlight({ color: e.target.value }).run()} className="size-7 cursor-pointer rounded border bg-transparent p-0" /></label>
                <button type="button" onClick={() => { run().unsetHighlight().run(); close() }} className="rounded-md px-2 py-1 hover:bg-neutral-100">من غير هايلايت</button>
              </div>
            </div>
          )}
        </Pop>
        <Btn label="مسح التنسيق" onClick={() => run().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="size-4" aria-hidden /></Btn>
      </div>

      <div className="flex items-center gap-0.5 overflow-x-auto border-t border-neutral-100 px-2 py-1 lg:flex-wrap">
        <Pop label="نمط الفقرة" width={200} active={s.heading > 0} trigger={<span className="text-sm">{headingLabel}</span>}>
          {(close) => HEADINGS.map((h) => (
            <MenuItem key={h.level} active={h.level === s.heading} onClick={() => { (h.level ? run().setHeading({ level: h.level as 1 | 2 | 3 }) : run().setParagraph()).run(); close() }}>
              <span className={h.cls}>{h.label}</span>
            </MenuItem>
          ))}
        </Pop>
        <Sep />

        <Btn label="قائمة نقطية" active={s.bullet} onClick={() => run().toggleBulletList().run()}><List className="size-4" aria-hidden /></Btn>
        <Btn label="قائمة مرقمة" active={s.ordered} onClick={() => run().toggleOrderedList().run()}><ListOrdered className="size-4" aria-hidden /></Btn>
        <Btn label="اقتباس" active={s.quote} onClick={() => run().toggleBlockquote().run()}><Quote className="size-4" aria-hidden /></Btn>
        <Sep />

        <Pop label="المحاذاة" active={!!s.align} width={170} trigger={<AlignIcon className="size-4" aria-hidden />}>
          {(close) => (
            <>
              {([['right', 'يمين', AlignRight], ['center', 'وسط', AlignCenter], ['left', 'شمال', AlignLeft], ['justify', 'ضبط', AlignJustify]] as const).map(([v, l, Icon]) => (
                <MenuItem key={v} active={s.align === v} onClick={() => { run().setTextAlign(v).run(); close() }}><Icon className="size-4" aria-hidden />{l}</MenuItem>
              ))}
            </>
          )}
        </Pop>
        <Btn label="اتجاه من اليمين لليسار" active={s.dir === 'rtl'} onClick={() => setDir('rtl')}><PilcrowLeft className="size-4" aria-hidden /></Btn>
        <Btn label="اتجاه من اليسار لليمين" active={s.dir === 'ltr'} onClick={() => setDir('ltr')}><PilcrowRight className="size-4" aria-hidden /></Btn>
        <Pop label="المسافة بين السطور" width={150} trigger={<UnfoldVertical className="size-4" aria-hidden />}>
          {(close) => LINE_HEIGHTS.map((h) => (
            <MenuItem key={h} active={s.lineHeight === h} onClick={() => { run().setLineHeight(h).run(); close() }}>{h}</MenuItem>
          ))}
        </Pop>
        <Sep />

        <Pop label="جدول" active={s.inTable} width={248} trigger={<Table2 className="size-4" aria-hidden />}>
          {(close) => (
            <div className="space-y-2">
              {!s.inTable && <TableGrid onPick={(rows, cols) => { run().insertTable({ rows, cols, withHeaderRow: true }).run(); close() }} />}
              {s.inTable && (
                <>
                  <MenuItem onClick={() => { run().addRowAfter().run(); close() }}>إضافة صف تحت</MenuItem>
                  <MenuItem onClick={() => { run().addRowBefore().run(); close() }}>إضافة صف فوق</MenuItem>
                  <MenuItem onClick={() => { run().addColumnAfter().run(); close() }}>إضافة عمود بعد</MenuItem>
                  <MenuItem onClick={() => { run().addColumnBefore().run(); close() }}>إضافة عمود قبل</MenuItem>
                  <MenuItem onClick={() => { run().toggleHeaderRow().run(); close() }}>صف العناوين</MenuItem>
                  <MenuItem disabled={!editor.can().mergeCells()} onClick={() => { run().mergeCells().run(); close() }}>دمج الخلايا</MenuItem>
                  <MenuItem disabled={!editor.can().splitCell()} onClick={() => { run().splitCell().run(); close() }}>فصل الخلية</MenuItem>
                  <div className="border-t pt-1">
                    <MenuItem danger onClick={() => { run().deleteRow().run(); close() }}>حذف الصف</MenuItem>
                    <MenuItem danger onClick={() => { run().deleteColumn().run(); close() }}>حذف العمود</MenuItem>
                    <MenuItem danger onClick={() => { run().deleteTable().run(); close() }}>حذف الجدول</MenuItem>
                  </div>
                </>
              )}
            </div>
          )}
        </Pop>
        <Btn label="خط فاصل" onClick={() => run().setHorizontalRule().run()}><Minus className="size-4 rotate-0" aria-hidden /><span className="sr-only">خط فاصل</span></Btn>
      </div>
    </div>
  )
}
