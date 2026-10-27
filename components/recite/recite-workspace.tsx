'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { EditorContent, useEditor, useEditorState, type JSONContent } from '@tiptap/react'
import { ArrowRight, CheckCheck, FileText, KeyRound, ListTree, Loader2, PenTool, Sparkles, Type, X, Zap, Trophy, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GeminiError, useGeminiConfig } from '@/lib/gemini'
import { gradeAttempt, type Report } from '@/lib/grade'
import { dataUrlToInline } from '@/lib/image'
import { ApiKeyDialog } from '@/components/recite/api-key-dialog'
import { EditorToolbar } from '@/components/recite/editor-toolbar'
import { InkPad, type InkHandle } from '@/components/recite/ink-pad'
import { ReportPanel } from '@/components/recite/report-panel'
import { createReciteExtensions } from '@/components/recite/editor-extensions'
import { reciteFontVars } from '@/components/recite/fonts'

type Lesson = { id: string; title: string; subject: string }
type SaveState = 'idle' | 'saving' | 'saved'
type Mode = 'type' | 'pen'

const draftKey = (id: string) => `kwk:recite:draft:${id}`
const inkKey = (id: string) => `kwk:recite:ink:${id}`
const reportKey = (id: string) => `kwk:recite:report:${id}`

function outlineToDoc(outline: string) {
  const content: JSONContent[] = []
  for (const raw of outline.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const sub = /^[-–•*]\s*/.test(line)
    const text = line.replace(/^[-–•*]\s*/, '')
    content.push({ type: 'heading', attrs: { level: sub ? 3 : 2 }, content: [{ type: 'text', text }] })
    content.push({ type: 'paragraph' })
  }
  return { type: 'doc', content } as JSONContent
}

function ProgressRing({ words, target = 100 }: { words: number; target?: number }) {
  const pct = Math.min(words / target, 1)
  const r = 16, circ = 2 * Math.PI * r, dash = circ * pct
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        className="transition-all duration-500" style={{ stroke: pct >= 1 ? '#059669' : pct > 0.5 ? 'var(--primary)' : '#d97706' }} />
    </svg>
  )
}

export function ReciteWorkspace({ lesson, reference, outline = '', referenceImage = null }: {
  lesson: Lesson; reference: string; outline?: string; referenceImage?: string | null
}) {
  const [keyOpen, setKeyOpen] = useState(false)
  const [save, setSave] = useState<SaveState>('idle')
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState<Mode>('type')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [lastReport, setLastReport] = useState<Report | null>(null)
  const [showOutline, setShowOutline] = useState(false)
  const [submitFlash, setSubmitFlash] = useState(false)
  const { config, ready } = useGeminiConfig()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ink = useRef<InkHandle>(null)
  const abort = useRef<AbortController | null>(null)
  const headings = useMemo(() => outline.split('\n').map((l) => l.trim()).filter(Boolean), [outline])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createReciteExtensions(),
    editorProps: {
      attributes: {
        dir: 'auto', spellcheck: 'true',
        class: 'recite-prose min-h-[70dvh] px-6 py-8 outline-none sm:px-14 sm:py-12',
      },
    },
    onUpdate: ({ editor }) => {
      setSave('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        try { localStorage.setItem(draftKey(lesson.id), JSON.stringify(editor.getJSON())) } catch {}
        setSave('saved')
      }, 600)
    },
  })

  useEffect(() => {
    if (!editor) return
    let restored = false
    try {
      const raw = localStorage.getItem(draftKey(lesson.id))
      if (raw) { editor.commands.setContent(JSON.parse(raw), { emitUpdate: false }); restored = true }
      const r = localStorage.getItem(reportKey(lesson.id))
      if (r) setLastReport(JSON.parse(r))
    } catch {}
    if (!restored && headings.length) editor.commands.setContent(outlineToDoc(outline), { emitUpdate: false })
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [editor, lesson.id, outline, headings.length])

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({ words: editor?.getText().trim().split(/\s+/).filter(Boolean).length ?? 0 }),
  })
  const wordCount = s?.words ?? 0

  const finish = async () => {
    if (busy) return
    if (!config) return setKeyOpen(true)
    const typed = editor?.getText({ blockSeparator: '\n' }).trim() ?? ''
    const onlyHeadings = typed.split('\n').filter((l) => l.trim() && !headings.some((h) => h.replace(/^[-–•*]\s*/, '') === l.trim())).length === 0
    const images = ink.current?.exportImages() ?? []
    if (onlyHeadings && images.length === 0) return setNotice('اكتب حاجة الأول قبل التصحيح.')
    if (!reference.trim() && !referenceImage) return setNotice('الدرس ده مالوش نص مرجعي لسه. كلّم الأدمن.')
    setNotice(''); setBusy(true); setSubmitFlash(true)
    setTimeout(() => setSubmitFlash(false), 600)
    abort.current = new AbortController()
    try {
      const r = await gradeAttempt(config, {
        title: lesson.title, outline: headings.join('\n'), reference,
        referenceImage: referenceImage ? dataUrlToInline(referenceImage) : null, typed, ink: images,
      }, abort.current.signal)
      setReport(r); setLastReport(r)
      try { localStorage.setItem(reportKey(lesson.id), JSON.stringify(r)) } catch {}
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setNotice(e instanceof GeminiError ? e.message : 'التصحيح فشل. جرّب تاني.')
    } finally { setBusy(false) }
  }

  return (
    <div className={cn('flex h-dvh flex-col', reciteFontVars)}>
      {/* ── Header ── */}
      <header className="ux-glass relative z-30 flex shrink-0 items-center gap-2 px-3 py-2">
        <Link href="/recite" aria-label="رجوع"
          className="flex size-9 items-center justify-center rounded-xl text-primary transition hover:scale-110 hover:bg-accent active:scale-95">
          <ArrowRight className="size-5" aria-hidden />
        </Link>

        <div className="min-w-0 flex-1" dir="rtl">
          <p className="truncate text-xs font-semibold text-primary" dir="auto">{lesson.subject}</p>
          <h1 className="ux-grad-text truncate text-sm font-extrabold sm:text-base" dir="auto">{lesson.title}</h1>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-0.5 rounded-xl border border-primary/20 bg-primary/5 p-1">
          {([
            ['type', 'كتابة', <Type key="t" className="size-3.5" aria-hidden />],
            ['pen', 'قلم', <PenTool key="p" className="size-3.5" aria-hidden />],
          ] as const).map(([m, label, icon]) => (
            <button key={m} type="button" onClick={() => setMode(m as Mode)} aria-pressed={mode === m}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                mode === m ? 'bg-primary text-primary-foreground shadow-md' : 'text-primary/70 hover:bg-accent hover:text-primary',
              )}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Save indicator */}
        <span className="hidden items-center gap-1.5 text-xs lg:flex" aria-live="polite">
          {save === 'saving' && <span className="flex items-center gap-1 text-amber-600"><Loader2 className="size-3.5 animate-spin" aria-hidden />حفظ...</span>}
          {save === 'saved' && <span className="flex items-center gap-1 text-success"><CheckCheck className="size-3.5" aria-hidden />اتحفظ</span>}
        </span>

        {headings.length > 0 && (
          <button type="button" onClick={() => setShowOutline((v) => !v)} title="العناوين" aria-label="العناوين"
            className={cn('flex size-9 items-center justify-center rounded-xl transition hover:scale-110',
              showOutline ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-primary')}>
            <ListTree className="size-5" aria-hidden />
          </button>
        )}

        {lastReport && (
          <button type="button" onClick={() => setReport(lastReport)} title="آخر تقرير" aria-label="آخر تقرير"
            className="flex size-9 items-center justify-center rounded-xl text-[color:var(--violet)] transition hover:scale-110 hover:bg-accent">
            <Trophy className="size-5" aria-hidden />
          </button>
        )}

        <button type="button" onClick={() => setKeyOpen(true)} title="مفتاح Gemini" aria-label="مفتاح Gemini"
          className={cn('relative flex size-9 items-center justify-center rounded-xl transition hover:scale-110 hover:bg-accent',
            ready && config ? 'text-success' : 'text-muted-foreground')}>
          <KeyRound className="size-5" aria-hidden />
          {ready && config && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-emerald-400" />}
        </button>

        <button type="button" onClick={finish} disabled={busy}
          className={cn('ux-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold', submitFlash && 'brightness-125')}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          <span className="relative hidden sm:inline">{busy ? 'بيصحح...' : 'خلصت، صحّح'}</span>
          <span className="relative sm:hidden">{busy ? '...' : 'صحّح'}</span>
        </button>
      </header>

      {/* ── Outline drawer ── */}
      {showOutline && (
        <div className="relative z-20 shrink-0 border-b border-primary/20 bg-primary/5" dir="rtl" style={{ animation: 'ux-rise .2s ease' }}>
          <div className="flex items-center justify-between gap-2 px-4 py-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <Star className="size-3.5" aria-hidden /> عناوين الدرس
            </p>
            <button type="button" onClick={() => setShowOutline(false)} className="text-muted-foreground transition-colors hover:text-primary" aria-label="إغلاق">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {headings.map((h, i) => (
              <span key={i}
                className={cn('rounded-full px-3 py-1 text-xs font-semibold',
                  /^[-–•*]/.test(h) ? 'border border-primary/25 bg-primary/10 text-primary' : 'bg-primary text-primary-foreground shadow-sm')}>
                {h.replace(/^[-–•*]\s*/, '')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Notice banner ── */}
      {notice && (
        <div role="status" className="ux-notice relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 text-sm" dir="rtl">
          <span className="flex items-center gap-2"><Zap className="size-4 text-amber-600" aria-hidden />{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="rounded p-0.5 transition-colors hover:bg-black/5" aria-label="إغلاق">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {/* ── Type mode ── */}
      <div className={cn('relative flex min-h-0 flex-1 flex-col', mode !== 'type' && 'hidden')}>
        <EditorToolbar editor={editor} />

        <div className="flex shrink-0 items-center justify-between border-b border-primary/10 bg-card/90 px-4 py-2 text-xs" dir="rtl">
          <span className="flex items-center gap-2">
            <span className={cn('size-2.5 rounded-full transition-colors duration-500', wordCount > 0 ? 'bg-emerald-400' : 'bg-muted-foreground/30')} />
            <span className={wordCount > 0 ? 'font-semibold text-success' : 'text-muted-foreground'}>
              {wordCount > 0 ? 'تكتب الآن' : 'في انتظار الكتابة...'}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <ProgressRing words={wordCount} />
            <span className="text-base font-extrabold tabular-nums text-primary">{wordCount}</span>
            <span className="text-muted-foreground">كلمة</span>
          </span>
        </div>

        <main className="relative flex-1 overflow-y-auto" onClick={() => editor?.commands.focus()}>
          <div className="ux-card relative mx-auto my-4 min-h-[calc(100%-2rem)] w-full max-w-[860px] bg-card sm:my-6"
            onClick={(e) => e.stopPropagation()}>
            <EditorContent editor={editor} />
          </div>
        </main>
      </div>

      <InkPad ref={ink} storageKey={inkKey(lesson.id)} active={mode === 'pen'} />
      <ApiKeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
      {report && <ReportPanel report={report} onClose={() => setReport(null)} />}
    </div>
  )
}
