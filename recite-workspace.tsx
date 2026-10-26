'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { EditorContent, useEditor, useEditorState, type JSONContent } from '@tiptap/react'
import { ArrowRight, CheckCheck, FileText, KeyRound, ListTree, Loader2, PenTool, Sparkles, Type, X } from 'lucide-react'
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

export function ReciteWorkspace({
  lesson,
  reference,
  outline,
  referenceImage,
}: {
  lesson: Lesson
  reference: string
  outline: string
  referenceImage: string | null
}) {
  const [keyOpen, setKeyOpen] = useState(false)
  const [save, setSave] = useState<SaveState>('idle')
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState<Mode>('type')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [lastReport, setLastReport] = useState<Report | null>(null)
  const [showOutline, setShowOutline] = useState(false)
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
        dir: 'auto',
        spellcheck: 'true',
        class: 'recite-prose min-h-[70dvh] px-6 py-8 outline-none sm:px-14 sm:py-12',
      },
    },
    onUpdate: ({ editor }) => {
      setSave('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(draftKey(lesson.id), JSON.stringify(editor.getJSON()))
        } catch {}
        setSave('saved')
      }, 600)
    },
  })

  useEffect(() => {
    if (!editor) return
    let restored = false
    try {
      const raw = localStorage.getItem(draftKey(lesson.id))
      if (raw) {
        editor.commands.setContent(JSON.parse(raw), { emitUpdate: false })
        restored = true
      }
      const r = localStorage.getItem(reportKey(lesson.id))
      if (r) setLastReport(JSON.parse(r))
    } catch {}
    if (!restored && headings.length) editor.commands.setContent(outlineToDoc(outline), { emitUpdate: false })
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [editor, lesson.id, outline, headings.length])

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({ words: editor?.getText().trim().split(/\s+/).filter(Boolean).length ?? 0 }),
  })

  const finish = async () => {
    if (busy) return
    if (!config) return setKeyOpen(true)
    const typed = editor?.getText({ blockSeparator: '\n' }).trim() ?? ''
    const onlyHeadings = typed.split('\n').filter((l) => l.trim() && !headings.some((h) => h.replace(/^[-–•*]\s*/, '') === l.trim())).length === 0
    const images = ink.current?.exportImages() ?? []
    if (onlyHeadings && images.length === 0) return setNotice('اكتب حاجة الأول قبل التصحيح.')
    if (!reference.trim() && !referenceImage) return setNotice('الدرس ده مالوش نص مرجعي لسه. كلّم الأدمن.')
    setNotice('')
    setBusy(true)
    abort.current = new AbortController()
    try {
      const r = await gradeAttempt(
        config,
        {
          title: lesson.title,
          outline: headings.join('\n'),
          reference,
          referenceImage: referenceImage ? dataUrlToInline(referenceImage) : null,
          typed,
          ink: images,
        },
        abort.current.signal,
      )
      setReport(r)
      setLastReport(r)
      try {
        localStorage.setItem(reportKey(lesson.id), JSON.stringify(r))
      } catch {}
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setNotice(e instanceof GeminiError ? e.message : 'التصحيح فشل. جرّب تاني.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex h-dvh flex-col bg-neutral-100 dark:bg-neutral-900', reciteFontVars)}>
      {/* ── Header ── */}
      <header className="z-30 flex shrink-0 items-center gap-2 border-b bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm dark:bg-neutral-950/95 dark:border-neutral-800">
        <Link
          href="/recite"
          aria-label="رجوع"
          className="flex size-9 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <ArrowRight className="size-5" aria-hidden />
        </Link>

        <div className="min-w-0 flex-1" dir="rtl">
          <p className="truncate text-xs font-medium text-primary" dir="auto">{lesson.subject}</p>
          <h1 className="truncate text-sm font-bold sm:text-base" dir="auto">{lesson.title}</h1>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-0.5 rounded-xl border bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-900">
          {([['type', 'كتابة', <Type className="size-3.5" aria-hidden />], ['pen', 'قلم', <PenTool className="size-3.5" aria-hidden />]] as const).map(([m, label, icon]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m as Mode)}
              aria-pressed={mode === m}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                mode === m
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
              )}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Save indicator */}
        <span className="hidden items-center gap-1 text-xs text-neutral-400 lg:flex" aria-live="polite">
          {save === 'saving' && <><Loader2 className="size-3.5 animate-spin" aria-hidden /> بيحفظ...</>}
          {save === 'saved' && <><CheckCheck className="size-3.5 text-emerald-500" aria-hidden /> اتحفظ</>}
        </span>

        {/* Outline toggle */}
        {headings.length > 0 && (
          <button
            type="button"
            onClick={() => setShowOutline((v) => !v)}
            title="العناوين"
            aria-label="العناوين"
            className={cn(
              'flex size-9 items-center justify-center rounded-xl transition-colors',
              showOutline
                ? 'bg-primary/10 text-primary'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800',
            )}
          >
            <ListTree className="size-5" aria-hidden />
          </button>
        )}

        {/* Last report */}
        {lastReport && (
          <button
            type="button"
            onClick={() => setReport(lastReport)}
            title="آخر تقرير"
            aria-label="آخر تقرير"
            className="flex size-9 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <FileText className="size-5" aria-hidden />
          </button>
        )}

        {/* Gemini key */}
        <button
          type="button"
          onClick={() => setKeyOpen(true)}
          title="مفتاح Gemini"
          aria-label="مفتاح Gemini"
          className={cn(
            'flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ready && config ? 'text-emerald-500' : 'text-neutral-400',
          )}
        >
          <KeyRound className="size-5" aria-hidden />
        </button>

        {/* Submit */}
        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:brightness-110 active:scale-95 disabled:opacity-70 disabled:shadow-none"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{busy ? 'بيصحح...' : 'خلصت، صحّح'}</span>
          <span className="sm:hidden">{busy ? '...' : 'صحّح'}</span>
        </button>
      </header>

      {/* ── Outline drawer ── */}
      {showOutline && (
        <div className="shrink-0 border-b bg-primary/5 dark:bg-primary/10 dark:border-neutral-800" dir="rtl">
          <div className="flex items-center justify-between gap-2 px-4 py-2">
            <p className="text-xs font-semibold text-primary">عناوين الدرس</p>
            <button type="button" onClick={() => setShowOutline(false)} className="text-neutral-400 hover:text-neutral-600" aria-label="إغلاق">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {headings.map((h, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  /^[-–•*]/.test(h)
                    ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                    : 'bg-primary/10 text-primary dark:bg-primary/20',
                )}
              >
                {h.replace(/^[-–•*]\s*/, '')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Notice banner ── */}
      {notice && (
        <div
          role="status"
          className="flex shrink-0 items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50"
          dir="rtl"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-800/50" aria-label="إغلاق">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {/* ── Type mode ── */}
      <div className={cn('flex min-h-0 flex-1 flex-col', mode !== 'type' && 'hidden')}>
        <EditorToolbar editor={editor} />

        {/* Word count bar */}
        <div className="flex shrink-0 items-center justify-between border-b bg-white/80 px-4 py-1.5 text-xs text-neutral-500 backdrop-blur-sm dark:bg-neutral-950/80 dark:border-neutral-800" dir="rtl">
          <span className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', (s?.words ?? 0) > 0 ? 'bg-emerald-400' : 'bg-neutral-300')} />
            {(s?.words ?? 0) > 0 ? 'تكتب' : 'في انتظار الكتابة'}
          </span>
          <span className="font-medium">{s?.words ?? 0} كلمة</span>
        </div>

        <main
          className="flex-1 overflow-y-auto bg-neutral-100 dark:bg-neutral-900"
          style={{ backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          onClick={() => editor?.commands.focus()}
        >
          <div
            className="mx-auto my-6 min-h-[calc(100%-3rem)] w-full max-w-[860px] rounded-2xl bg-white shadow-xl ring-1 ring-black/5 dark:bg-neutral-950 dark:ring-white/5"
            onClick={(e) => e.stopPropagation()}
          >
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
