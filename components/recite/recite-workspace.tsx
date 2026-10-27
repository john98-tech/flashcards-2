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

function FloatingParticle({ delay, x, size, color }: { delay: number; x: number; size: number; color: string }) {
  return (
    <div
      className="pointer-events-none absolute bottom-0 rounded-full opacity-0"
      style={{ left: `${x}%`, width: size, height: size, background: color, animation: `floatUp 4s ease-in ${delay}s infinite` }}
    />
  )
}

function ProgressRing({ words, target = 100 }: { words: number; target?: number }) {
  const pct = Math.min(words / target, 1)
  const r = 16, circ = 2 * Math.PI * r, dash = circ * pct
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-neutral-200 dark:text-neutral-700" />
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        className="transition-all duration-500" style={{ stroke: pct >= 1 ? '#10b981' : pct > 0.5 ? '#6366f1' : '#f59e0b' }} />
    </svg>
  )
}

export function ReciteWorkspace({ lesson, reference, outline, referenceImage }: {
  lesson: Lesson; reference: string; outline: string; referenceImage: string | null
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

  const particles = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    delay: i * 0.6, x: 10 + i * 10, size: 4 + (i % 3) * 3,
    color: ['#818cf8','#34d399','#f472b6','#fb923c','#38bdf8','#a78bfa','#4ade80','#facc15'][i],
  })), [])

  return (
    <>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1);   opacity: 0; }
          10%  { opacity: 0.7; }
          90%  { opacity: 0.3; }
          100% { transform: translateY(-120px) scale(0.4); opacity: 0; }
        }
        @keyframes gradientShift {
          0%,100% { background-position: 0% 50%; }
          50%     { background-position: 100% 50%; }
        }
        @keyframes slideDown {
          from { opacity:0; transform: translateY(-8px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes bounceIn {
          0%   { transform: scale(0.92); opacity: 0; }
          60%  { transform: scale(1.02); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes flashSubmit {
          0%,100% { opacity:1; }
          50%     { opacity:0.6; }
        }
        .recite-submit-flash { animation: flashSubmit 0.3s ease; }
        .recite-gradient-text {
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradientShift 4s ease infinite;
        }
        .recite-card-paper {
          background: white;
          box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06), 0 20px 48px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04);
        }
        .dark .recite-card-paper {
          background: #0f0f12;
          box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.4), 0 20px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05);
        }
        .recite-submit-btn {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
          background-size: 200% 200%;
          animation: gradientShift 3s ease infinite;
          transition: filter 0.2s, transform 0.15s;
        }
        .recite-submit-btn:hover:not(:disabled) { filter: brightness(1.15); }
        .recite-submit-btn:active:not(:disabled) { transform: scale(0.96); }
        .word-badge {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-weight: 800;
        }
        .top-accent-bar {
          background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899, #6366f1);
          background-size: 200% 100%;
          animation: gradientShift 3s ease infinite;
        }
      `}</style>

      <div className={cn('flex h-dvh flex-col', reciteFontVars)}
        style={{ background: 'linear-gradient(160deg,#f8f7ff 0%,#f0f4ff 40%,#fdf2f8 100%)' }}>

        <div className="pointer-events-none fixed inset-0 hidden dark:block"
          style={{ background: 'linear-gradient(160deg,#0c0a1a 0%,#0a0f1e 40%,#150a1a 100%)' }} />

        {/* ── Header ── */}
        <header
          className="relative z-30 flex shrink-0 items-center gap-2 px-3 py-2 backdrop-blur-xl"
          style={{ background: 'rgba(255,255,255,0.88)', borderBottom: '1px solid rgba(99,102,241,0.18)', boxShadow: '0 1px 24px rgba(99,102,241,0.12)' }}
        >
          <div className="pointer-events-none absolute inset-0 hidden dark:block"
            style={{ background: 'rgba(10,8,25,0.92)', borderBottom: '1px solid rgba(99,102,241,0.22)' }} />

          <Link href="/recite" aria-label="رجوع"
            className="relative flex size-9 items-center justify-center rounded-xl text-indigo-500 transition-all hover:bg-indigo-50 hover:text-indigo-700 hover:scale-110 active:scale-95 dark:hover:bg-indigo-950/50">
            <ArrowRight className="size-5" aria-hidden />
          </Link>

          <div className="relative min-w-0 flex-1" dir="rtl">
            <p className="truncate text-xs font-semibold" style={{ color: '#6366f1' }} dir="auto">{lesson.subject}</p>
            <h1 className="truncate text-sm font-bold sm:text-base recite-gradient-text" dir="auto">{lesson.title}</h1>
          </div>

          {/* Mode toggle */}
          <div className="relative flex gap-0.5 rounded-xl p-1"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            {([
              ['type', 'كتابة', <Type className="size-3.5" aria-hidden />],
              ['pen',  'قلم',   <PenTool className="size-3.5" aria-hidden />],
            ] as const).map(([m, label, icon]) => (
              <button key={m} type="button" onClick={() => setMode(m as Mode)} aria-pressed={mode === m}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                  mode === m ? 'recite-submit-btn text-white shadow-lg' : 'text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/40',
                )}>
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Save indicator */}
          <span className="relative hidden items-center gap-1.5 text-xs lg:flex" aria-live="polite">
            {save === 'saving' && <span className="flex items-center gap-1 text-amber-500"><Loader2 className="size-3.5 animate-spin" aria-hidden />حفظ...</span>}
            {save === 'saved'  && <span className="flex items-center gap-1 text-emerald-500" style={{ animation: 'bounceIn 0.3s ease' }}><CheckCheck className="size-3.5" aria-hidden />اتحفظ ✓</span>}
          </span>

          {/* Outline toggle */}
          {headings.length > 0 && (
            <button type="button" onClick={() => setShowOutline((v) => !v)} title="العناوين" aria-label="العناوين"
              className={cn('relative flex size-9 items-center justify-center rounded-xl transition-all duration-200 hover:scale-110',
                showOutline ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-400 hover:text-indigo-500')}
              style={showOutline ? { background: 'rgba(99,102,241,0.15)' } : {}}>
              <ListTree className="size-5" aria-hidden />
            </button>
          )}

          {/* Last report */}
          {lastReport && (
            <button type="button" onClick={() => setReport(lastReport)} title="آخر تقرير" aria-label="آخر تقرير"
              className="relative flex size-9 items-center justify-center rounded-xl text-violet-400 transition-all hover:bg-violet-50 hover:text-violet-600 hover:scale-110 dark:hover:bg-violet-950/30">
              <Trophy className="size-5" aria-hidden />
            </button>
          )}

          {/* Gemini key */}
          <button type="button" onClick={() => setKeyOpen(true)} title="مفتاح Gemini" aria-label="مفتاح Gemini"
            className={cn('relative flex size-9 items-center justify-center rounded-xl transition-all hover:scale-110',
              ready && config ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800')}>
            <KeyRound className="size-5" aria-hidden />
            {ready && config && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #34d399' }} />}
          </button>

          {/* Submit */}
          <button type="button" onClick={finish} disabled={busy}
            className={cn('relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white shadow-lg disabled:opacity-60 recite-submit-btn', submitFlash && 'recite-submit-flash')}
            style={{ boxShadow: '0 4px 20px rgba(99,102,241,0.5)' }}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            <span className="hidden sm:inline">{busy ? 'بيصحح...' : 'خلصت، صحّح ✨'}</span>
            <span className="sm:hidden">{busy ? '...' : 'صحّح'}</span>
          </button>
        </header>

        {/* ── Outline drawer ── */}
        {showOutline && (
          <div className="relative z-20 shrink-0" dir="rtl"
            style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08))', borderBottom: '1px solid rgba(99,102,241,0.2)', animation: 'slideDown 0.2s ease' }}>
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                <Star className="size-3.5" aria-hidden /> عناوين الدرس
              </p>
              <button type="button" onClick={() => setShowOutline(false)} className="text-neutral-400 hover:text-indigo-500 transition-colors" aria-label="إغلاق">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {headings.map((h, i) => (
                <span key={i} className="rounded-full px-3 py-1 text-xs font-semibold transition-all hover:scale-105"
                  style={/^[-–•*]/.test(h)
                    ? { background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }
                    : { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
                  {h.replace(/^[-–•*]\s*/, '')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Notice banner ── */}
        {notice && (
          <div role="status" className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 text-sm" dir="rtl"
            style={{ background: 'linear-gradient(135deg,rgba(251,191,36,0.15),rgba(249,115,22,0.12))', borderBottom: '1px solid rgba(251,191,36,0.3)', color: '#92400e', animation: 'slideDown 0.2s ease' }}>
            <span className="flex items-center gap-2"><Zap className="size-4 text-amber-500" aria-hidden />{notice}</span>
            <button type="button" onClick={() => setNotice('')} className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors" aria-label="إغلاق">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* ── Type mode ── */}
        <div className={cn('relative flex min-h-0 flex-1 flex-col', mode !== 'type' && 'hidden')}>
          <EditorToolbar editor={editor} />

          {/* Word count bar */}
          <div className="relative flex shrink-0 items-center justify-between px-4 py-2 text-xs backdrop-blur-sm" dir="rtl"
            style={{ background: 'rgba(255,255,255,0.82)', borderBottom: '1px solid rgba(99,102,241,0.12)' }}>
            <div className="pointer-events-none absolute inset-0 hidden dark:block" style={{ background: 'rgba(10,8,25,0.7)' }} />
            <span className="relative flex items-center gap-2">
              <span className={cn('size-2.5 rounded-full transition-all duration-500', wordCount > 0 ? 'bg-emerald-400' : 'bg-neutral-300 dark:bg-neutral-600')}
                style={wordCount > 0 ? { boxShadow: '0 0 8px #34d399' } : {}} />
              <span className={wordCount > 0 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-neutral-400'}>
                {wordCount > 0 ? 'تكتب الآن ✍️' : 'في انتظار الكتابة...'}
              </span>
            </span>
            <span className="relative flex items-center gap-2">
              <ProgressRing words={wordCount} />
              <span className="word-badge text-base">{wordCount}</span>
              <span className="text-neutral-400">كلمة</span>
            </span>
          </div>

          {/* Editor */}
          <main className="relative flex-1 overflow-y-auto"
            style={{ background: 'linear-gradient(160deg,#f8f7ff 0%,#f0f4ff 50%,#fdf2f8 100%)' }}
            onClick={() => editor?.commands.focus()}>

            {/* Floating particles */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {particles.map((p, i) => <FloatingParticle key={i} {...p} />)}
            </div>

            {/* Dot grid */}
            <div className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

            <div className="relative mx-auto my-6 min-h-[calc(100%-3rem)] w-full max-w-[860px] rounded-2xl recite-card-paper"
              style={{ animation: 'bounceIn 0.4s ease' }}
              onClick={(e) => e.stopPropagation()}>
              {/* Top accent */}
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl top-accent-bar" />
              <EditorContent editor={editor} />
            </div>
          </main>
        </div>

        <InkPad ref={ink} storageKey={inkKey(lesson.id)} active={mode === 'pen'} />
        <ApiKeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
        {report && <ReportPanel report={report} onClose={() => setReport(null)} />}
      </div>
    </>
  )
}
