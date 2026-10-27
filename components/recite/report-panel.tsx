'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { reportToText, type Report } from '@/lib/grade'

/* ---------- Markdown خفيف (من غير مكتبات) ---------- */

function inline(text: string, prefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\x60[^\x60]+\x60|\*[^*\s][^*]*\*)/g
  let last = 0
  let n = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const key = prefix + '-' + n++
    if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={key} className="font-bold">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('\x60')) out.push(<code key={key} dir="ltr" className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>)
    else out.push(<em key={key}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const FENCE = '\x60\x60\x60'
const LIST = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const HR = /^\s*([-*_])\1{2,}\s*$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const cells = (s: string) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

function isSpecial(line: string, next?: string) {
  const t = line.trim()
  return (
    t.startsWith(FENCE) ||
    HEADING.test(line) ||
    LIST.test(line) ||
    HR.test(line) ||
    t.startsWith('>') ||
    (t.includes('|') && next !== undefined && TABLE_SEP.test(next))
  )
}

function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0
  const k = () => 'b' + key++

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    if (line.trim().startsWith(FENCE)) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(FENCE)) code.push(lines[i++])
      i++
      blocks.push(
        <pre key={k()} dir="ltr" className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const h = HEADING.exec(line)
    if (h) {
      const level = h[1].length
      blocks.push(
        <div key={k()} role="heading" aria-level={level} dir="auto" className={cn('mt-2 font-bold', level <= 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm')}>
          {inline(h[2], 'h' + key)}
        </div>,
      )
      i++
      continue
    }

    if (HR.test(line)) {
      blocks.push(<hr key={k()} className="my-1 border-border" />)
      i++
      continue
    }

    if (line.trim().startsWith('>')) {
      const q: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) q.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push(
        <blockquote key={k()} dir="auto" className="border-s-4 border-primary/40 bg-muted/50 px-3 py-2 text-sm leading-relaxed">
          {q.map((l, n) => (
            <div key={n}>{inline(l, 'q' + n)}</div>
          ))}
        </blockquote>,
      )
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const body: string[][] = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) body.push(cells(lines[i++]))
      blocks.push(
        <div key={k()} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {head.map((c, ci) => (
                  <th key={ci} dir="auto" className="border bg-muted px-2 py-1 text-start font-semibold">{inline(c, 'th' + ci)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} dir="auto" className="border px-2 py-1">{inline(c, 'td' + ri + '-' + ci)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    const li = LIST.exec(line)
    if (li) {
      const ordered = /\d/.test(li[2])
      const items: { indent: number; text: string }[] = []
      while (i < lines.length) {
        if (!lines[i].trim() && LIST.test(lines[i + 1] ?? '')) {
          i++
          continue
        }
        const mm = LIST.exec(lines[i])
        if (!mm) break
        items.push({ indent: Math.floor(mm[1].replace(/\t/g, '  ').length / 2), text: mm[3] })
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={k()} className={cn('flex flex-col gap-1 ps-5 text-sm leading-relaxed', ordered ? 'list-decimal' : 'list-disc')}>
          {items.map((it, n) => (
            <li key={n} dir="auto" style={{ marginInlineStart: it.indent * 16 }}>{inline(it.text, 'li' + n)}</li>
          ))}
        </Tag>,
      )
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i], lines[i + 1])) para.push(lines[i++])
    if (para.length === 0) para.push(lines[i++])
    blocks.push(
      <p key={k()} dir="auto" className="text-sm leading-relaxed">
        {para.map((l, n) => (
          <span key={n}>
            {inline(l, 'p' + n)}
            {n < para.length - 1 && <br />}
          </span>
        ))}
      </p>,
    )
  }

  return <div className="flex flex-col gap-3">{blocks}</div>
}

/* ---------- نافذة عرض رد Gemini ---------- */

function Confetto({ delay, x, rotate, color }: { delay: number; x: number; rotate: number; color: string }) {
  return (
    <span
      className="pointer-events-none absolute top-0 block h-2.5 w-1.5 rounded-sm opacity-0"
      style={{
        left: `${x}%`,
        background: color,
        transform: `rotate(${rotate}deg)`,
        animation: `ux-confetti 1.1s ease-out ${delay}s forwards`,
      }}
    />
  )
}

export function ReportPanel({ report, onClose }: { report: Report; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState(false)
  // تقارير قديمة (قبل التعديل) شكلها مختلف ومفيهاش text.
  const text = typeof report?.text === 'string' ? report.text : ''

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const confetti = text
    ? Array.from({ length: 16 }, (_, i) => ({
        delay: i * 0.035,
        x: 4 + ((i * 61) % 92),
        rotate: (i * 47) % 360,
        color: ['#14b8a6', '#8b5cf6', '#fb7185', '#f59e0b', '#10b981'][i % 5],
      }))
    : []

  const copy = async () => {
    await navigator.clipboard.writeText(reportToText({ text }))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-black/50 transition-opacity duration-200 sm:items-center sm:p-4',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      role="dialog"
      aria-modal
      aria-label="رد Gemini"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl"
        style={{ animation: visible ? 'ux-pop 0.35s ease' : undefined, boxShadow: '0 24px 60px -20px color-mix(in oklch, var(--primary) 55%, transparent)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden">
          {confetti.map((c, i) => <Confetto key={i} {...c} />)}
        </div>

        <div
          className="relative flex items-center gap-3 p-4 text-white"
          style={{ background: 'var(--brand-grad)' }}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Sparkles className="size-4.5" aria-hidden />
          </span>
          <h2 className="min-w-0 flex-1 text-lg font-extrabold drop-shadow-sm">رد Gemini</h2>
          <button
            type="button"
            onClick={copy}
            aria-label="انسخ الرد"
            className="flex size-9 items-center justify-center rounded-xl bg-white/15 transition-all hover:scale-110 hover:bg-white/25 active:scale-95"
          >
            {copied ? <Check className="size-4" style={{ animation: 'ux-pop 0.25s ease' }} /> : <Copy className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="اقفل"
            className="flex size-9 items-center justify-center rounded-xl bg-white/15 transition-all hover:scale-110 hover:bg-white/25 active:scale-95"
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          className="overflow-y-auto p-4"
          style={{ background: 'linear-gradient(180deg, color-mix(in oklch, var(--primary) 6%, transparent), transparent 140px)' }}
        >
          {text ? <Markdown source={text} /> : <p className="text-sm text-muted-foreground">التقرير ده قديم. اضغط "خلصت، صحّح" تاني.</p>}
        </div>
      </div>
    </div>
  )
}
