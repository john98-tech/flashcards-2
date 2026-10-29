'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Pencil, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadDeck, saveCard } from '@/app/admin/actions'
import { fromCloze, toCloze, tokenize, type Card, type Deck } from '@/lib/cloze'
import type { DeckSummary } from '@/lib/decks'

type Props = { decks: DeckSummary[]; onClose: () => void }

export function AdminQuickReview({ decks, onClose }: Props) {
  const [deckId, setDeckId] = useState('')
  const [deck, setDeck] = useState<Deck | null>(null)
  const [position, setPosition] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [textDraft, setTextDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const current = deck?.cards[position] ?? null
  const parsed = useMemo(() => current ? fromCloze(current.cloze) : null, [current])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    setDeck(null)
    setPosition(0)
    setSelected(new Set())
    setEditMode(false)
    if (!deckId) return
    let cancelled = false
    setLoading(true)
    setError('')
    loadDeck(deckId).then((loaded) => {
      if (!cancelled) {
        setDeck(loaded)
        setPosition(0)
        setStatus('')
      }
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this deck.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [deckId])

  const persist = useCallback(async (nextCard: Card, nextCards?: Card[]) => {
    if (!deck) return
    setSaving(true)
    setError('')
    try {
      const cards = nextCards ?? deck.cards.map((card) => card.id === nextCard.id ? nextCard : card)
      await saveCard(deck.id, nextCard, cards.findIndex((card) => card.id === nextCard.id))
      setDeck((old) => old ? { ...old, cards } : old)
      setStatus('Saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed. Please try again.')
      setStatus('')
    } finally {
      setSaving(false)
    }
  }, [deck])

  const toggleToken = (index: number) => {
    if (!deck || !current || !parsed || !editMode) return
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setSelected(next)
    const cloze = toCloze(parsed.text, parsed.tokens, next)
    void persist({ ...current, cloze })
  }

  const saveText = async () => {
    if (!current) return
    const next = { ...current, cloze: textDraft }
    await persist(next)
    setEditingText(false)
  }

  const go = (delta: number) => {
    setPosition((p) => Math.max(0, Math.min((deck?.cards.length ?? 1) - 1, p + delta)))
    setSelected(new Set())
    setStatus('')
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}><ArrowLeft aria-hidden /> الرئيسية</Button>
          <div>
            <h2 className="text-lg font-bold">مراجعة سريعة للكروت</h2>
            <p className="text-xs text-muted-foreground">وضع خاص بالأدمن — التعديلات تُحفظ على الموقع مباشرةً</p>
          </div>
        </div>
        <Button type="button" variant={editMode ? 'default' : 'outline'} onClick={() => { setEditMode((v) => !v); setSelected(new Set()) }}>
          <Pencil aria-hidden /> {editMode ? 'إيقاف Edit Mode' : 'تشغيل Edit Mode'}
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        اختار الديك
        <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2.5" disabled={loading}>
          <option value="">اختار ديك للمراجعة...</option>
          {decks.map((item) => <option key={item.id} value={item.id}>{item.groupName} — {item.title}</option>)}
        </select>
      </label>

      {loading && <p className="py-10 text-center text-sm text-muted-foreground">جاري تحميل الكروت...</p>}
      {!loading && !deckId && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">اختار الديك عشان تبدأ المراجعة.</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {deck && current && !loading && (
        <>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span dir="auto" className="font-semibold text-foreground">{deck.title}</span>
            <span>Card {position + 1} / {deck.cards.length}</span>
          </div>
          <div className="min-h-48 rounded-2xl border bg-background p-5 text-base leading-8 sm:p-7">
            {parsed?.tokens.map((token, index) => {
              if (token.space) return <span key={index}>{token.text}</span>
              const blank = selected.has(index) || current.cloze.slice(token.start - 2, token.start) === '{{'
              const clozeToken = current.cloze.includes('{{' + token.text + '}}')
              const showBlank = editMode ? selected.has(index) || clozeToken : clozeToken
              return <button key={index} type="button" disabled={!editMode} onClick={() => toggleToken(index)} className={editMode ? 'mx-0.5 rounded px-0.5 underline decoration-dotted underline-offset-4 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : 'mx-0.5 cursor-default'} aria-label={editMode ? 'تبديل إخفاء الكلمة ' + token.text : undefined}>{showBlank ? <span className="inline-block min-w-12 border-b-2 border-primary/60 px-2 text-center text-transparent select-none">{token.text}</span> : token.text}</button>
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!editMode || saving} onClick={() => { setTextDraft(current.cloze); setEditingText(true) }}>Edit text</Button>
              {editMode && <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => { const restored = { ...current, cloze: parsed?.text ?? current.cloze }; void persist(restored); setSelected(new Set()) }}><RotateCcw aria-hidden /> إظهار كل الكلمات</Button>}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={position === 0} onClick={() => go(-1)}><ChevronLeft aria-hidden /> السابق</Button>
              <Button type="button" variant="outline" size="sm" disabled={position >= deck.cards.length - 1} onClick={() => go(1)}>التالي <ChevronRight aria-hidden /></Button>
            </div>
          </div>
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{saving ? 'جاري الحفظ...' : status === 'Saved' ? <><Check className="mr-1 inline size-3.5" aria-hidden /> تم الحفظ على الموقع</> : editMode ? 'Edit Mode شغال — اضغط على أي كلمة لتبديل إخفائها.' : 'عرض عادي مثل الطالب. شغّل Edit Mode لتعديل الكارت.'}</p>
        </>
      )}

      {editingText && current && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="quick-review-edit-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-2xl sm:p-6">
            <h3 id="quick-review-edit-title" className="font-semibold">Edit card text</h3>
            <p className="text-sm text-muted-foreground">حافظ على الأقواس المزدوجة {{ و }} حول الكلمات المطلوب إخفاؤها.</p>
            <textarea autoFocus dir="auto" value={textDraft} onChange={(e) => setTextDraft(e.target.value)} rows={9} className="w-full rounded-lg border bg-background p-3 text-sm leading-7" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingText(false)}>إلغاء</Button>
              <Button type="button" onClick={() => void saveText()} disabled={saving}><Save aria-hidden /> حفظ النص</Button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
