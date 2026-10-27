'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Loader2, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiKeyDialog } from '@/components/gemini/api-key-dialog'
import { WordEditor } from './word-editor'
import { autoCloze, parseTerms, splitIntoCards, type Card } from '@/lib/cloze'
import { GeminiError, generate as geminiGenerate, useGeminiConfig } from '@/lib/gemini'

type Props = {
  terms: string
  onTermsChange: (terms: string) => void
  onGenerate: (cards: Card[]) => void
}

const newId = () => Math.random().toString(36).slice(2, 10)

const PROMPT_STORAGE_KEY = 'kwk:cloze-prompt'

export const DEFAULT_CLOZE_PROMPT = `You are an expert medical educator who builds fill-in-the-blank (cloze) flashcards for students from textbook text.
Convert the text I send you into flashcards.

SPLITTING (keep cards SMALL)
- One card = one idea or one sub-topic. Target 30 to 80 words, never more than about 100 words or 12 blanks.
- If a topic is longer, split it into several cards by sub-topic, even when the source is one continuous paragraph. Each card must make sense on its own.
- Every table or diagram goes in its own card. If a table is long, split its rows across several cards and repeat the header row in each.

BREADCRUMB (first line of EVERY card)
- Start every card with one line in this exact format:
>> Subject > Chapter or Section > Topic > Sub-topic
  for example: >> Histology > Cell membrane > Molecular structure
- Use 2 to 4 levels, written in the language of the source text, short (1 to 4 words each).
- Infer the path from the text and its headings. Keep the same names for the same topic across cards.
- Never put {{ }} in the breadcrumb line.

FORMATTING THE CARD BODY (Markdown-like)
- Headings from the source: "# " for the main title, "## " for a sub-title, "### " for a smaller one, "#### " for the smallest. Biggest to smallest follows the hierarchy of the source.
- Lists: start each item with "- " (or "1. " if numbered).
- Indentation: indent nested items or sub-points by 2 spaces per level.
- Normal sentences are plain lines with no marker.

HIDING WORDS
- Wrap every important word or phrase in double curly braces, for example {{stroke volume}}.
- Hide: disease names, organs and anatomical structures, hormones, enzymes, receptors, drugs and doses, normal values, numbers together with their units, causes and effects, scientific terms, classifications and abbreviations.
- Each hidden phrase is 1 to 4 words and meaningful on its own. Roughly one blank for every 6 to 10 words.
- Never hide filler words (articles, prepositions, conjunctions, pronouns, generic verbs) and never hide a whole sentence. Never hide words inside headings or the breadcrumb.
- Never nest braces and never leave a brace unclosed.

WORDING
- Do not change, translate, shorten, summarize or reorder the original wording. Keep every word in its original language exactly as written.
- The only things you may add are the breadcrumb line and the Markdown markers (#, -, indentation). Only fix line breaks that were broken by a PDF.

TABLES
- Keep a table as a Markdown table, with the same rows and columns, and hide the key terms inside the cells with {{ }}. Keep the header row visible.

OUTPUT
- Return JSON only, with one string per card in the "cards" array. Use \\n for line breaks inside each card string.`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: { cards: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['cards'],
}

export function SourcePanel({ terms, onGenerate }: Props) {
  const [text, setText] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [joinLines, setJoinLines] = useState(true)
  const [numbers, setNumbers] = useState(true)
  const [abbreviations, setAbbreviations] = useState(true)

  const { config, ready } = useGeminiConfig()
  const [keyOpen, setKeyOpen] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_CLOZE_PROMPT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROMPT_STORAGE_KEY)
      if (saved) setPrompt(saved)
    } catch {}
  }, [])

  const changePrompt = (value: string) => {
    setPrompt(value)
    try {
      localStorage.setItem(PROMPT_STORAGE_KEY, value)
    } catch {}
  }

  const resetPrompt = () => {
    setPrompt(DEFAULT_CLOZE_PROMPT)
    try {
      localStorage.removeItem(PROMPT_STORAGE_KEY)
    } catch {}
  }

  const clearEditor = () => {
    setText('')
    setResetKey((k) => k + 1)
  }

  const generateLocal = () => {
    const chunks = splitIntoCards(text, joinLines)
    const termList = parseTerms(terms)
    onGenerate(chunks.map((chunk) => ({ id: newId(), cloze: autoCloze(chunk, { numbers, abbreviations, terms: termList }) })))
    clearEditor()
  }

  const generateWithAi = async () => {
    if (!config) {
      setKeyOpen(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      const raw = await geminiGenerate(config, text.trim(), {
        system: prompt,
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      })
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as { cards?: unknown }
      const list = (Array.isArray(parsed.cards) ? parsed.cards : [])
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.trim())
      if (list.length === 0) throw new GeminiError('Gemini مرجّعش كروت. جرّب تاني أو عدّل البرومبت.')

      const termList = parseTerms(terms)
      const cards: Card[] = list.map((cloze) => {
        const opens = (cloze.match(/\{\{/g) ?? []).length
        const closes = (cloze.match(/\}\}/g) ?? []).length
        // Broken or missing blanks: fall back to the local auto-blanking for that card only.
        if (opens === 0 || opens !== closes) {
          const plain = cloze.replace(/\{\{|\}\}/g, '')
          return { id: newId(), cloze: autoCloze(plain, { numbers, abbreviations, terms: termList }) }
        }
        return { id: newId(), cloze }
      })
      onGenerate(cards)
      clearEditor()
    } catch (err) {
      setError(
        err instanceof GeminiError
          ? err.message
          : err instanceof SyntaxError
            ? 'رد Gemini مكانش بالشكل المطلوب. جرّب تاني.'
            : 'حصل خطأ غير متوقع.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="source" className="text-sm font-semibold">
          الصق صفحة أو أكتر من الكتاب
        </label>
        <button
          type="button"
          onClick={() => setKeyOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted"
        >
          <KeyRound className="size-3.5" aria-hidden />
          {ready && config ? `Gemini متصل (${config.model})` : 'اربط مفتاح Gemini'}
        </button>
      </div>

      <div className="[&_.word-editor-content]:min-h-[480px]">
        <WordEditor
          onTextChange={setText}
          resetKey={resetKey}
          placeholder="الصق النص أو جدول Word هنا؛ الجداول هتتحول لجدول منسق في الكارت…"
        />
      </div>

      <details className="rounded-lg border bg-background p-3">
        <summary className="cursor-pointer text-sm font-medium">برومبت Gemini (تقدر تعدّل عليه)</summary>
        <textarea
          dir="ltr"
          value={prompt}
          onChange={(e) => changePrompt(e.target.value)}
          rows={16}
          className="mt-3 w-full resize-y rounded-lg border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">النص بيتبعت لـ Gemini مع البرومبت ده، والتعديل بيتحفظ تلقائي.</p>
          <Button type="button" variant="outline" size="sm" onClick={resetPrompt}>
            <RotateCcw aria-hidden /> رجّع الافتراضي
          </Button>
        </div>
      </details>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={generateWithAi} disabled={!text.trim() || busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {busy ? 'Gemini بيحوّل النص…' : 'حوّل لفلاش كاردس بـ Gemini'}
        </Button>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">تقسيم وتفريغ يدوي بدون ذكاء اصطناعي</summary>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Toggle checked={joinLines} onChange={setJoinLines} label="صلّح سطور الـ PDF المكسورة" />
          <Toggle checked={numbers} onChange={setNumbers} label="فرّغ الأرقام ووحداتها" />
          <Toggle checked={abbreviations} onChange={setAbbreviations} label="فرّغ الاختصارات (ECG)" />
          <Button variant="outline" onClick={generateLocal} disabled={!text.trim()}>
            <Wand2 aria-hidden /> قسّم وفرّغ
          </Button>
        </div>
      </details>

      <ApiKeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
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
