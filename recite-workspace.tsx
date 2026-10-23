'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { EditorContent, useEditor, useEditorState, type JSONContent } from '@tiptap/react'
import { ArrowLeft, CheckCheck, FileText, KeyRound, ListTree, Loader2, PenTool, Sparkles, Type } from 'lucide-react'
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

/** "Heading" lines become H2, lines starting with "-" become H3; each is followed by an empty paragraph to write in. */
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

  // Restore the saved draft; otherwise start from the admin's outline.
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
    // Words beyond the outline headings themselves.
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

  const tab = (m: Mode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', mode === m ? 'bg-primary text-primary-foreground' : 'text-neutral-600 hover:bg-neutral-100')}
    >
      {icon} {label}
    </button>
  )

  return (
    <div className={cn('flex h-dvh flex-col bg-neutral-200/70', reciteFontVars)}>
      <header className="z-30 flex shrink-0 items-center gap-2 border-b bg-white px-3 py-2">
        <Link href="/recite" aria-label="رجوع" className="flex size-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-primary" dir="auto">{lesson.subject}</p>
          <h1 className="truncate text-sm font-bold sm:text-base" dir="auto">{lesson.title}</h1>
        </div>
        <div className="flex gap-1 rounded-lg border bg-white p-0.5">
          {tab('type', 'كتابة', <Type className="size-4" aria-hidden />)}
          {tab('pen', 'قلم', <PenTool className="size-4" aria-hidden />)}
        </div>
        <span className="hidden items-center gap-1 text-xs text-neutral-500 lg:flex" aria-live="polite">
          {save === 'saving' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : save === 'saved' ? <CheckCheck className="size-3.5 text-success" aria-hidden /> : null}
          {save === 'saving' ? 'بيحفظ...' : save === 'saved' ? 'اتحفظ' : ''}
        </span>
        {headings.length > 0 && (
          <button type="button" onClick={() => setShowOutline((v) => !v)} aria-label="العناوين" title="العناوين" className="flex size-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100">
            <ListTree className="size-5" aria-hidden />
          </button>
        )}
        {lastReport && (
          <button type="button" onClick={() => setReport(lastReport)} aria-label="آخر تقرير" title="آخر تقرير" className="flex size-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100">
            <FileText className="size-5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => setKeyOpen(true)}
          aria-label="مفتاح Gemini"
          title="مفتاح Gemini"
          className={cn('flex size-9 items-center justify-center rounded-lg hover:bg-neutral-100', ready && config ? 'text-success' : 'text-neutral-500')}
        >
          <KeyRound className="size-5" aria-hidden />
        </button>
        <button type="button" onClick={finish} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-70">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {busy ? 'بيصحح...' : 'خلصت، صحّح'}
        </button>
      </header>

      {showOutline && (
        <div className="flex shrink-0 flex-wrap gap-2 border-b bg-white px-4 py-2 text-xs" dir="auto">
          {headings.map((h, i) => (
            <span key={i} className={cn('rounded-full bg-accent px-3 py-1 text-accent-foreground', /^[-–•*]/.test(h) && 'opacity-75')}>
              {h.replace(/^[-–•*]\s*/, '')}
            </span>
          ))}
        </div>
      )}

      {notice && (
        <p role="status" onClick={() => setNotice('')} className="shrink-0 cursor-pointer bg-highlight px-4 py-2 text-center text-sm text-highlight-foreground">
          {notice}
        </p>
      )}

      <div className={cn('flex min-h-0 flex-1 flex-col', mode !== 'type' && 'hidden')}>
        <EditorToolbar editor={editor} />
        <p className="shrink-0 border-b bg-white px-4 py-1 text-end text-xs text-neutral-500">{s?.words ?? 0} كلمة</p>
        <main className="flex-1 overflow-y-auto px-0 py-0 sm:px-4 sm:py-6" onClick={() => editor?.commands.focus()}>
          <div className="mx-auto min-h-full w-full max-w-[860px] bg-white text-neutral-900 shadow-sm sm:min-h-[1100px] sm:rounded-sm sm:shadow-md" onClick={(e) => e.stopPropagation()}>
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
