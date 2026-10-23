'use client'

import { useState } from 'react'
import { AlertTriangle, BookOpenCheck, Check, CheckCircle2, Copy, SpellCheck, X, MoveUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { reportToText, type Report } from '@/lib/grade'

export function ReportPanel({ report, onClose }: { report: Report; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const tone = report.score >= 85 ? 'text-success' : report.score >= 60 ? 'text-amber-600' : 'text-destructive'
  const copy = async () => {
    await navigator.clipboard.writeText(reportToText(report))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal aria-label="تقرير التصحيح" dir="rtl">
      <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl">
        <div className="flex items-center gap-4 border-b p-4">
          <div className={cn('flex size-16 shrink-0 items-center justify-center rounded-full border-4 text-xl font-bold', tone, 'border-current')}>{report.score}</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">تقرير التصحيح</h2>
            <p className="text-sm text-muted-foreground" dir="auto">{report.verdict}</p>
          </div>
          <button type="button" onClick={copy} aria-label="انسخ التقرير" className="flex size-9 items-center justify-center rounded-lg hover:bg-accent">
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          </button>
          <button type="button" onClick={onClose} aria-label="اقفل" className="flex size-9 items-center justify-center rounded-lg hover:bg-accent">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-4">
          <Section icon={<AlertTriangle className="size-4" />} title="معلومات غلط" color="text-destructive" empty="مفيش معلومات غلط، برافو!" count={report.wrong.length}>
            {report.wrong.map((w, i) => (
              <li key={i} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p dir="auto"><span className="text-muted-foreground">كتبت: </span><span className="line-through decoration-destructive/60">{w.written}</span></p>
                <p dir="auto" className="mt-1 font-medium"><span className="text-muted-foreground font-normal">الصح: </span>{w.correct}</p>
                <p dir="auto" className="mt-1 text-xs text-muted-foreground">{w.why}</p>
              </li>
            ))}
          </Section>

          <Section icon={<MoveUpDown className="size-4" />} title="معلومات تحت عنوان غير مناسب" color="text-orange-600" empty="كل معلومة تحت عنوان مناسب." count={report.misplaced?.length ?? 0}>
            {(report.misplaced ?? []).map((m, i) => (
              <li key={i} className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 text-sm" dir="auto">
                <p className="font-medium">{m.written}</p>
                <p className="mt-1"><span className="text-muted-foreground">العنوان الحالي: </span>{m.actualHeading}</p>
                <p><span className="text-muted-foreground">العنوان الصحيح: </span>{m.expectedHeading}</p>
                <p className="mt-1 text-xs text-muted-foreground">{m.why}</p>
              </li>
            ))}
          </Section>

          <Section icon={<SpellCheck className="size-4" />} title="أخطاء إملائية" color="text-amber-600" empty="مفيش أخطاء إملائية." count={report.spelling.length}>
            {report.spelling.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" dir="auto">
                <span className="line-through decoration-amber-600/60">{s.written}</span> ← <span className="font-semibold">{s.correct}</span>
              </li>
            ))}
          </Section>

          <Section icon={<BookOpenCheck className="size-4" />} title="معلومات ناقصة" color="text-primary" empty="غطيت كل النقاط المهمة." count={report.missing.length}>
            {report.missing.map((m, i) => (
              <li key={i} className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" dir="auto">
                <p className="font-semibold">{m.topic}</p>
                <p className="mt-1 text-muted-foreground">{m.detail}</p>
              </li>
            ))}
          </Section>

          <Section icon={<CheckCircle2 className="size-4" />} title="اللي كتبته صح" color="text-success" empty="" count={report.correct.length}>
            {report.correct.map((c, i) => (
              <li key={i} className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm" dir="auto">{c}</li>
            ))}
          </Section>

          {report.tips && <p className="rounded-lg bg-highlight p-3 text-sm text-highlight-foreground" dir="auto">{report.tips}</p>}

          {report.transcription && (
            <details className="rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer font-medium">النص اللي Gemini قراه من خط إيدك</summary>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground" dir="auto">{report.transcription}</p>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, color, empty, count, children }: { icon: React.ReactNode; title: string; color: string; empty: string; count: number; children: React.ReactNode }) {
  if (count === 0 && !empty) return null
  return (
    <section>
      <h3 className={cn('mb-2 flex items-center gap-2 text-sm font-bold', color)}>
        {icon} {title} <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{count}</span>
      </h3>
      {count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="flex flex-col gap-2">{children}</ul>}
    </section>
  )
}
