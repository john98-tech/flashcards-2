'use client'

import { useState } from 'react'
import { Check, Copy, Plus, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WordEditor } from './word-editor'
import { autoCloze, buildPrompt, parseTerms, prepareText, splitIntoCards, type Card } from '@/lib/cloze'

type Props = {
  terms: string
  onTermsChange: (terms: string) => void
  onGenerate: (cards: Card[]) => void
}

const newId = () => Math.random().toString(36).slice(2, 10)

export function SourcePanel({ terms, onTermsChange, onGenerate }: Props) {
  const [text, setText] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [aiReply, setAiReply] = useState('')
  const [joinLines, setJoinLines] = useState(true)
  const [numbers, setNumbers] = useState(true)
  const [abbreviations, setAbbreviations] = useState(true)
  const [copied, setCopied] = useState(false)

  const generate = () => {
    const chunks = splitIntoCards(text, joinLines)
    const termList = parseTerms(terms)
    onGenerate(chunks.map((chunk) => ({ id: newId(), cloze: autoCloze(chunk, { numbers, abbreviations, terms: termList }) })))
    setText('')
    setResetKey((k) => k + 1)
  }

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(buildPrompt(prepareText(text, joinLines)))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const addAiTerms = () => {
    const merged = parseTerms(`${terms}\n${aiReply}`)
    onTermsChange(merged.join('\n'))
    setAiReply('')
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <label htmlFor="source" className="text-sm font-semibold">
          1. الصق صفحة أو أكتر من الكتاب
        </label>
        <WordEditor
          onTextChange={setText}
          resetKey={resetKey}
          placeholder="الصق النص أو جدول Word هنا؛ الجداول هتتحول لجدول منسق في الكارت…"
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Toggle checked={joinLines} onChange={setJoinLines} label="صلّح سطور الـ PDF المكسورة" />
          <Toggle checked={numbers} onChange={setNumbers} label="فرّغ الأرقام ووحداتها" />
          <Toggle checked={abbreviations} onChange={setAbbreviations} label="فرّغ الاختصارات (ECG)" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={generate} disabled={!text.trim()}>
            <Wand2 aria-hidden /> قسّم وفرّغ
          </Button>
          <Button size="lg" variant="outline" onClick={copyPrompt} disabled={!text.trim()}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'اتنسخ' : 'انسخ برومبت للذكاء الاصطناعي'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <label htmlFor="terms" className="text-sm font-semibold">
          2. قائمة الكلمات المهمة
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          كل كلمة هنا بتتفرّغ في أي مكان في الكتاب. القائمة بتكبر مع كل صفحة، فبعد كام صفحة مش هتحتاج الذكاء
          الاصطناعي تقريباً.
        </p>
        <textarea
          id="terms"
          dir="auto"
          value={terms}
          onChange={(e) => onTermsChange(e.target.value)}
          rows={6}
          placeholder={'stroke volume\nsinoatrial node\n…'}
          className="w-full resize-y rounded-lg border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <label htmlFor="ai-reply" className="text-xs font-medium text-muted-foreground">
          الصق قائمة الكلمات اللي رجّعها الذكاء الاصطناعي هنا
        </label>
        <textarea
          id="ai-reply"
          dir="auto"
          value={aiReply}
          onChange={(e) => setAiReply(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-lg border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button variant="secondary" onClick={addAiTerms} disabled={!aiReply.trim()}>
          <Plus aria-hidden /> ضيفهم للقائمة
        </Button>
      </div>
    </section>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-primary" />
      {label}
    </label>
  )
}
