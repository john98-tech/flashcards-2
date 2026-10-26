'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { ArrowLeft, Bold, CheckCheck, Heading1, Heading2, Italic, KeyRound, Loader2, Redo2, Sparkles, Underline, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generate, useGeminiConfig } from '@/lib/gemini'
import { ApiKeyDialog } from '@/components/recite/api-key-dialog'

type Lesson = { id: string; title: string; subject: string }
type SaveState = 'idle' | 'saving' | 'saved'

const draftKey = (id: string) => `kwk:recite:draft:${id}`

function parseReport(raw: string): any | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-9 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-30',
        active && 'bg-primary/10 text-primary',
      )}
    >
      {children}
    </button>
  )
}

export function ReciteWorkspace({ lesson, reference }: { lesson: Lesson; reference: string }) {
  const [keyOpen, setKeyOpen] = useState(false)
  const [save, setSave] = useState<SaveState>('idle')
  const [notice, setNotice] = useState('')
  const [grading, setGrading] = useState(false)
  const [report, setReport] = useState<any>(null)
  const [rawReply, setRawReply] = useState('')
  const { config, ready } = useGeminiConfig()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'ابدأ اكتب كل اللي فاكره من الدرس هنا...' }),
    ],
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
    try {
      const raw = localStorage.getItem(draftKey(lesson.id))
      if (raw) editor.commands.setContent(JSON.parse(raw), { emitUpdate: false })
    } catch {}
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [editor, lesson.id])

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      underline: editor?.isActive('underline') ?? false,
      heading1: editor?.isActive('heading', { level: 1 }) ?? false,
      heading2: editor?.isActive('heading', { level: 2 }) ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
      words: editor?.getText().trim().split(/\s+/).filter(Boolean).length ?? 0,
    }),
  })

  const finish = async () => {
    if (!config) return setKeyOpen(true)
    const answer = editor?.getText().trim() ?? ''
    if (!answer) return setNotice('اكتب حاجة الأول قبل التصحيح.')
    if (!reference.trim()) return setNotice('مفيش نص مرجعي محفوظ للدرس ده؛ اطلب من المسؤول إضافته.')
    setGrading(true); setReport(null); setNotice(''); setRawReply('')
    try {
      const prompt = 'صحح تسميع الطالب مقارنة حصريًا بالنص المرجعي. اعتبر النص المرجعي المصدر المعتمد ولا تخترع معلومات. اقبل الصياغات المكافئة، وراجع الحقائق والعناوين والتفاصيل. افصل المعلومات الخاطئة والناقصة والمعلومات الموضوعة تحت عنوان غير مناسب والأخطاء الإملائية. أرجع JSON فقط بالشكل: {"summary":{"score":0},"wrongFacts":[{"studentText":"","correction":"","reason":""}],"missingFacts":[{"expected":"","section":""}],"misplacedFacts":[{"studentText":"","correctSection":"","reason":""}],"spelling":[{"written":"","correct":"","context":""}],"strengths":[],"nextSteps":[]}. الدرجة من 100 ولا تخصم مرتين عن نفس الخطأ. النص المرجعي:\n' + reference + '\nإجابة الطالب:\n' + answer
      const raw = await generate(config, prompt, { temperature: 0.1, json: true })
      const parsed = parseReport(raw)
      if (parsed) { setReport(parsed); setNotice('تم التصحيح. التقرير التفصيلي جاهز.') }
      else { setRawReply(raw); setNotice('تم التصحيح.') }
    } catch (err) { setNotice(err instanceof Error ? err.message : 'تعذر تصحيح التسميع. جرّب مرة أخرى.') }
    finally { setGrading(false) }
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-100">
      {/* ── Header ── */}
      <header className="z-30 flex shrink-0 items-center gap-2 border-b bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <Link
          href="/recite"
          aria-label="رجوع"
          className="flex size-9 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1" dir="rtl">
          <p className="truncate text-xs font-medium text-primary" dir="auto">{lesson.subject}</p>
          <h1 className="truncate text-sm font-bold sm:text-base" dir="auto">{lesson.title}</h1>
        </div>
        <span className="hidden items-center gap-1 text-xs text-neutral-400 sm:flex" aria-live="polite">
          {save === 'saving' && <><Loader2 className="size-3.5 animate-spin" aria-hidden /> بيحفظ...</>}
          {save === 'saved' && <><CheckCheck className="size-3.5 text-emerald-500" aria-hidden /> اتحفظ</>}
        </span>
        <button
          type="button"
          onClick={() => setKeyOpen(true)}
          aria-label="مفتاح Gemini"
          title="مفتاح Gemini"
          className={cn(
            'flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-neutral-100',
            ready && config ? 'text-emerald-500' : 'text-neutral-400',
          )}
        >
          <KeyRound className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={grading}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:shadow-none"
        >
          {grading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{grading ? 'بيصحح...' : 'خلصت، صحّح'}</span>
          <span className="sm:hidden">{grading ? '...' : 'صحّح'}</span>
        </button>
      </header>

      {/* ── Toolbar ── */}
      <div className="z-20 flex shrink-0 items-center gap-0.5 overflow-x-auto border-b bg-white/90 px-3 py-1.5 backdrop-blur-sm">
        <ToolButton label="تراجع" disabled={!s?.canUndo} onClick={() => editor?.chain().focus().undo().run()}><Undo2 className="size-4" aria-hidden /></ToolButton>
        <ToolButton label="إعادة" disabled={!s?.canRedo} onClick={() => editor?.chain().focus().redo().run()}><Redo2 className="size-4" aria-hidden /></ToolButton>
        <span className="mx-1.5 h-5 w-px bg-neutral-200" aria-hidden />
        <ToolButton label="عريض" active={s?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="size-4" aria-hidden /></ToolButton>
        <ToolButton label="مائل" active={s?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="size-4" aria-hidden /></ToolButton>
        <ToolButton label="تحته خط" active={s?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline className="size-4" aria-hidden /></ToolButton>
        <span className="mx-1.5 h-5 w-px bg-neutral-200" aria-hidden />
        <ToolButton label="عنوان رئيسي" active={s?.heading1} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="size-4" aria-hidden /></ToolButton>
        <ToolButton label="عنوان فرعي" active={s?.heading2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" aria-hidden /></ToolButton>
        <div className="ms-auto flex items-center gap-2 ps-3">
          <span className={cn('size-2 rounded-full transition-colors', (s?.words ?? 0) > 0 ? 'bg-emerald-400' : 'bg-neutral-300')} />
          <span className="text-xs text-neutral-500">{s?.words ?? 0} كلمة</span>
        </div>
      </div>

      {/* ── Notice ── */}
      {notice && (
        <div
          role="status"
          onClick={() => setNotice('')}
          className="flex shrink-0 cursor-pointer items-center justify-center gap-2 border-b bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
          dir="rtl"
        >
          {notice}
        </div>
      )}

      {/* ── Writing area ── */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)', backgroundSize: '24px 24px', backgroundColor: '#f3f4f6' }}
        onClick={() => editor?.commands.focus()}
      >
        <div
          className="mx-auto my-6 min-h-[calc(100%-3rem)] w-full max-w-[860px] rounded-2xl bg-white shadow-xl ring-1 ring-black/5"
          onClick={(e) => e.stopPropagation()}
        >
          <EditorContent editor={editor} />
        </div>
      </main>

      {/* ── Report overlay ── */}
      {report && (
        <section className="fixed inset-0 z-40 overflow-y-auto bg-neutral-100 p-3 sm:p-8" dir="rtl">
          <div className="mx-auto max-w-4xl space-y-4">
            <header className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm font-medium text-primary">تقرير التسميع الذكي</p>
                <h2 className="text-2xl font-bold">نتيجة {lesson.title}</h2>
              </div>
              <button
                onClick={() => setReport(null)}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-50"
              >
                العودة للكتابة
              </button>
            </header>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ScoreTile title="الدرجة" value={report.summary?.score ?? 0} suffix="/100" highlight />
              <ScoreTile title="معلومات خاطئة" value={report.wrongFacts?.length ?? 0} />
              <ScoreTile title="معلومات ناقصة" value={report.missingFacts?.length ?? 0} />
              <ScoreTile title="أخطاء إملائية" value={report.spelling?.length ?? 0} />
            </div>

            <ReportSection title="المعلومات الخاطئة" items={report.wrongFacts} render={(x: any) => (
              <><p className="font-semibold text-red-600">{x.studentText}</p><p className="mt-1 text-emerald-700">✓ الصحيح: {x.correction}</p><p className="mt-1 text-sm text-neutral-500">{x.reason}</p></>
            )} />
            <ReportSection title="المعلومات الناقصة" items={report.missingFacts} render={(x: any) => (
              <><p>{x.expected}</p><p className="mt-1 text-sm text-neutral-500">القسم: {x.section}</p></>
            )} />
            <ReportSection title="معلومات في غير مكانها" items={report.misplacedFacts} render={(x: any) => (
              <><p>{x.studentText}</p><p className="mt-1 text-emerald-700">مكانها الصح: {x.correctSection}</p><p className="mt-1 text-sm text-neutral-500">{x.reason}</p></>
            )} />
            <ReportSection title="الأخطاء الإملائية" items={report.spelling} render={(x: any) => (
              <p>{x.written} ← <strong className="text-emerald-700">{x.correct}</strong><span className="ms-2 text-sm text-neutral-500">{x.context}</span></p>
            )} />
            <ReportSection title="نقاط القوة" items={(report.strengths ?? []).map((x: string) => ({ text: x }))} render={(x: any) => <p>✓ {x.text}</p>} />
            <ReportSection title="خطوات للمراجعة" items={(report.nextSteps ?? []).map((x: string) => ({ text: x }))} render={(x: any) => <p>• {x.text}</p>} />

            <button
              onClick={() => { setReport(null); editor?.commands.focus() }}
              className="w-full rounded-2xl bg-primary py-3 font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:brightness-110"
            >
              الرجوع للتسميع
            </button>
          </div>
        </section>
      )}

      {rawReply && (
        <section className="fixed inset-0 z-40 overflow-y-auto bg-neutral-100 p-3 sm:p-8" dir="rtl">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-xl font-bold">رد Gemini</h2>
              <p className="whitespace-pre-wrap leading-8" dir="auto">{rawReply}</p>
            </div>
            <button onClick={() => setRawReply('')} className="w-full rounded-2xl bg-primary py-3 font-semibold text-primary-foreground">
              الرجوع للتسميع
            </button>
          </div>
        </section>
      )}

      <ApiKeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
    </div>
  )
}

function ScoreTile({ title, value, suffix = '', highlight = false }: { title: string; value: unknown; suffix?: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm', highlight ? 'bg-primary text-primary-foreground border-primary' : 'bg-white')}>
      <p className={cn('text-sm', highlight ? 'text-primary-foreground/70' : 'text-neutral-500')}>{title}</p>
      <p className="mt-1 text-2xl font-bold">{String(value)}{suffix}</p>
    </div>
  )
}

function ReportSection({ title, items, render }: { title: string; items?: any[]; render: (item: any) => React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-lg font-bold">
        {title} <span className="text-sm font-normal text-neutral-400">({items?.length ?? 0})</span>
      </h3>
      {!items?.length ? (
        <p className="text-sm text-neutral-400">مفيش ملاحظات في القسم ده. 🎉</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="rounded-xl bg-neutral-50 p-3 leading-relaxed">{render(item)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
