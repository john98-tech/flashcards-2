'use client'

import { useEffect, useState } from 'react'
import { BookOpenText, Loader2, Save } from 'lucide-react'
import type { DeckSummary } from '@/lib/decks'
import { loadReciteConfig, saveReciteConfig } from '@/app/admin/actions'

export function RecitationEditor({ decks }: { decks: DeckSummary[] }) {
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '')
  const [source, setSource] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    if (!deckId) { setSource(''); setPrompt(''); return }
    setLoading(true)
    setMessage('')
    loadReciteConfig(deckId)
      .then(value => { if (active) { setSource(value.source); setPrompt(value.prompt) } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'تعذر التحميل') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deckId])

  const save = async () => {
    if (!deckId) return
    setSaving(true); setMessage('')
    try {
      await saveReciteConfig(deckId, source, prompt)
      setMessage('تم حفظ النص المرجعي والبرومبت.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر الحفظ')
    } finally { setSaving(false) }
  }

  const areaCls = 'w-full rounded-xl border bg-background p-4 text-sm leading-7 outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

  return <section className="space-y-4" dir="rtl">
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><BookOpenText className="size-5" /></span>
        <div><h2 className="text-xl font-bold">إعداد دروس التسميع بالكتابة</h2><p className="text-sm text-muted-foreground">مصدر التصحيح وقواعده منفصلين عن محتوى الفلاش كاردس.</p></div>
      </div>
      <label className="mb-2 block text-sm font-semibold" htmlFor="recite-lesson">اختار الدرس</label>
      <select id="recite-lesson" value={deckId} onChange={e => setDeckId(e.target.value)} className="mb-4 w-full rounded-lg border bg-background px-3 py-2">
        {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.groupName} — {deck.title}</option>)}
      </select>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold" htmlFor="recite-source">النص المرجعي (الذكاء الاصطناعي هيصحح منه فقط)</label>
          <textarea id="recite-source" value={source} onChange={e => setSource(e.target.value)} disabled={loading || !deckId} rows={18} placeholder="الصق النص الكامل للدرس هنا. حافظ على العناوين الرئيسية والفرعية بتاعته..." className={areaCls} />
          <p className="mt-1 text-xs text-muted-foreground">{source.length.toLocaleString()} حرف</p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold" htmlFor="recite-prompt">البرومبت والقواعد (طريقة التصحيح)</label>
          <textarea id="recite-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} disabled={loading || !deckId} rows={18} placeholder="اكتب هنا التعليمات والقواعد اللي الذكاء الاصطناعي يصحح بيها..." className={areaCls} />
          <p className="mt-1 text-xs text-muted-foreground">{prompt.length.toLocaleString()} حرف</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        <button type="button" disabled={loading || saving || !deckId} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {saving || loading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {saving ? 'بيحفظ...' : loading ? 'بيحمّل...' : 'حفظ'}
        </button>
      </div>
      {message && <p role="status" className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p>}
    </div>
  </section>
}
