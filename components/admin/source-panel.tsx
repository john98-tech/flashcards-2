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

const GEMINI_PROMPT_STORAGE_KEY = 'kwk:cloze-prompt:gemini'
const GROQ_PROMPT_STORAGE_KEY = 'kwk:cloze-prompt:groq'
const getPromptStorageKey = (provider?: 'gemini' | 'groq') => provider === 'groq' ? GROQ_PROMPT_STORAGE_KEY : GEMINI_PROMPT_STORAGE_KEY

export const DEFAULT_CLOZE_PROMPT = `You are an expert medical educator creating concise cloze flashcards from textbook content.

CARD SIZE
- Make cards SHORT and easy to review: usually 25–60 words, ideally 1–6 blanks, and never more than 80 words unless a table/diagram requires it.
- One card covers one clearly defined idea, definition, mechanism, classification, or small subtopic.
- Split long paragraphs and long lists into multiple cards at natural boundaries. Do not put an entire chapter or large topic on one card.
- For tables, create a separate card per small logical group of rows; repeat a short header if needed.

BREADCRUMB
- Begin each card with exactly one short breadcrumb line: >> Subject > Topic > Subtopic
- Use only 2–3 useful levels. Keep the same wording for repeated topics.
- Do not add a breadcrumb for every heading or repeat the breadcrumb inside a card.

PRESERVE THE SOURCE FORMAT
- Preserve the source wording exactly: do not translate, paraphrase, summarize, or reorder it.
- Preserve original headings, lists, numbering, table rows/columns, and hierarchy.
- Do NOT add Markdown heading markers (#, ##, ###, ####) to ordinary lines or add decorative # symbols.
- Keep original headings as plain text, without adding # characters.
- For nested lists, use two spaces per indentation level and the original bullet/numbering style. Never flatten nested items.
- Keep tables as Markdown tables with the original rows and columns. Keep the header visible.
- Do not invent headings, bullets, indentation, or extra structure that was not in the source. Only add the breadcrumb line and cloze braces.

CLOZE BLANKS
- Hide important terms or short meaningful phrases using {{double curly braces}}.
- Prioritize scientific terms, anatomical structures, diseases, hormones, enzymes, receptors, drugs, values with units, causes/effects, classifications, and abbreviations.
- Each blank should usually be 1–4 words. Aim for roughly one blank per 8–12 words.
- Do not hide filler words or entire sentences. Never hide words in the breadcrumb. Never nest braces.
- Keep all original text outside the braces unchanged.

OUTPUT
- Return valid JSON only: { "cards": ["card text", "..."] }.
- Each array item is one complete card. Do not put separators, explanations, numbering, or Markdown code fences around the JSON.`

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
  const [draftReady, setDraftReady] = useState(false)
  const sourceDraftKey = 'sammaa-admin-source-panel-draft-v1'

  const updateSourceText = (value: string) => {
    setText(value)
    // Write on each editor update, not only in a later React effect, so a quick
    // refresh cannot race the debounce/state update and lose the latest text.
    try {
      if (!value) localStorage.removeItem(sourceDraftKey)
      else localStorage.setItem(sourceDraftKey, JSON.stringify({ text: value, joinLines, numbers, abbreviations, savedAt: Date.now() }))
    } catch {}
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(sourceDraftKey)
      if (raw) {
        const saved = JSON.parse(raw) as { text?: string; joinLines?: boolean; numbers?: boolean; abbreviations?: boolean }
        if (typeof saved.text === 'string') setText(saved.text)
        if (typeof saved.joinLines === 'boolean') setJoinLines(saved.joinLines)
        if (typeof saved.numbers === 'boolean') setNumbers(saved.numbers)
        if (typeof saved.abbreviations === 'boolean') setAbbreviations(saved.abbreviations)
      }
    } catch {}
    setDraftReady(true)
  }, [])

  useEffect(() => {
    if (!draftReady) return
    try {
      if (!text) localStorage.removeItem(sourceDraftKey)
      else localStorage.setItem(sourceDraftKey, JSON.stringify({ text, joinLines, numbers, abbreviations, savedAt: Date.now() }))
    } catch {}
  }, [draftReady, text, joinLines, numbers, abbreviations])

  const { config, ready } = useGeminiConfig()
  const [keyOpen, setKeyOpen] = useState(false)
  const [geminiPrompt, setGeminiPrompt] = useState(DEFAULT_CLOZE_PROMPT)
  const [groqPrompt, setGroqPrompt] = useState(DEFAULT_CLOZE_PROMPT)
  const activePrompt = config?.provider === 'groq' ? groqPrompt : geminiPrompt
  const setActivePrompt = config?.provider === 'groq' ? setGroqPrompt : setGeminiPrompt
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const savedGemini = localStorage.getItem(GEMINI_PROMPT_STORAGE_KEY)
      const savedGroq = localStorage.getItem(GROQ_PROMPT_STORAGE_KEY)
      if (savedGemini) setGeminiPrompt(savedGemini)
      if (savedGroq) setGroqPrompt(savedGroq)
    } catch {}
  }, [])

  const changePrompt = (value: string) => {
    setActivePrompt(value)
    try {
      localStorage.setItem(getPromptStorageKey(config?.provider), value)
    } catch {}
  }

  const resetPrompt = () => {
    setActivePrompt(DEFAULT_CLOZE_PROMPT)
    try {
      localStorage.removeItem(getPromptStorageKey(config?.provider))
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
      const source = text.trim()
      // Process very long documents in paragraph-aware batches to keep the editor
      // responsive and avoid oversized Gemini requests. Preserve batch order.
      const chunks: string[] = []
      let batch = ''
      for (const paragraph of source.split(/\n\s*\n/)) {
        const next = paragraph.trim()
        if (!next) continue
        if (batch && batch.length + next.length + 2 > 12000) {
          chunks.push(batch)
          batch = ''
        }
        if (next.length > 12000) {
          if (batch) chunks.push(batch)
          batch = ''
          for (let i = 0; i < next.length; i += 12000) chunks.push(next.slice(i, i + 12000))
        } else {
          batch += (batch ? '\n\n' : '') + next
        }
      }
      if (batch) chunks.push(batch)

      const list: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        setError(chunks.length > 1 ? `Gemini بيحوّل الجزء ${i + 1} من ${chunks.length}…` : '')
        const raw = await geminiGenerate(config, chunks[i], {
          system: activePrompt,
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        })
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as { cards?: unknown }
        const partCards = (Array.isArray(parsed.cards) ? parsed.cards : [])
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim())
        list.push(...partCards)
      }
      if (list.length === 0) throw new GeminiError('Gemini مرجّعش كروت. جرّب تاني أو عدّل البرومبت.')
      setError('')

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
          {ready && config ? `${config.provider === 'groq' ? 'Groq' : 'Gemini'} متصل (${config.model})` : 'اربط مفتاح الذكاء الاصطناعي'}
        </button>
      </div>

      <div className="[&_.word-editor-content]:min-h-[480px]">
        <WordEditor
          key={draftReady ? 'source-draft-restored' : 'source-draft-loading'}
          debounceMs={0}
          initialText={text}
          onTextChange={updateSourceText}
          resetKey={resetKey}
          placeholder="الصق النص أو جدول Word هنا؛ الجداول هتتحول لجدول منسق في الكارت…"
        />
      </div>

      <details className="rounded-lg border bg-background p-3">
        <summary className="cursor-pointer text-sm font-medium">برومبت {config?.provider === 'groq' ? 'Groq' : 'Gemini'} (منفصل لكل مزوّد)</summary>
        <textarea
          dir="ltr"
          value={activePrompt}
          onChange={(e) => changePrompt(e.target.value)}
          rows={16}
          className="mt-3 w-full resize-y rounded-lg border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">البرومبت ده خاص بـ {config?.provider === 'groq' ? 'Groq' : 'Gemini'} فقط، والتعديلات بتتحفظ بشكل مستقل لكل مزوّد.</p>
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
          {busy ? `${config?.provider === 'groq' ? 'Groq' : 'Gemini'} بيحوّل النص…` : `حوّل لفلاش كاردس بـ ${config?.provider === 'groq' ? 'Groq' : 'Gemini'}`}
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
