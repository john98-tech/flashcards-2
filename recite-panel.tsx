'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ImagePlus, Loader2, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DeckSummary } from '@/lib/decks'
import { loadReciteRef, saveReciteRef } from '@/app/admin/actions'
import { fileToCompressedDataUrl } from '@/lib/image'

export function RecitePanel({ decks }: { decks: DeckSummary[] }) {
  const [deckId, setDeckId] = useState('')
  const [outline, setOutline] = useState('')
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!deckId) return
    setLoading(true)
    setMsg('')
    loadReciteRef(deckId)
      .then((r) => {
        setOutline(r.outline)
        setText(r.referenceText)
        setImage(r.referenceImage)
      })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false))
  }, [deckId])

  const pick = async (file?: File) => {
    if (!file) return
    try {
      setImage(await fileToCompressedDataUrl(file, 1800, 0.82))
    } catch {
      setMsg('معرفتش أقرأ الصورة دي.')
    }
  }

  const save = () =>
    start(async () => {
      try {
        await saveReciteRef(deckId, { outline, referenceText: text, referenceImage: image })
        setMsg('اتحفظ ✓')
      } catch (e) {
        setMsg((e as Error).message)
      }
    })

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4" dir="rtl">
      <div>
        <h2 className="text-lg font-bold">إعدادات التسميع الكتابي</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          اختار الدرس، وحط العناوين الرئيسية اللي هتظهر للطالب في الصفحة البيضا، والنص (أو صورة الصفحة) اللي Gemini هيصحح عليه.
          لو سبت النص فاضي، هيستخدم نص كروت الدرس.
        </p>
      </div>

      <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="w-full rounded-lg border bg-background p-2 text-sm sm:w-96" dir="auto">
        <option value="">اختار درس…</option>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.groupName} — {d.title}
          </option>
        ))}
      </select>

      {deckId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            العناوين الرئيسية (عنوان في كل سطر، ابدأ السطر بـ - للعنوان الفرعي)
            <textarea value={outline} onChange={(e) => setOutline(e.target.value)} rows={9} dir="auto" disabled={loading}
              placeholder={'Structure of the heart\n- Chambers\n- Valves\nBlood flow'}
              className="rounded-lg border bg-background p-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            نص الدرس المرجعي (اختياري)
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} dir="auto" disabled={loading}
              placeholder="الصق نص الدرس الكامل هنا…"
              className="rounded-lg border bg-background p-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" />
          </label>

          <div className="flex flex-col gap-2 lg:col-span-2">
            <span className="text-sm font-semibold">صورة الدرس المرجعية (اختياري، Gemini هيقراها)</span>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <ImagePlus aria-hidden /> {image ? 'غيّر الصورة' : 'ارفع صورة'}
              </Button>
              {image && (
                <Button variant="outline" onClick={() => setImage(null)}>
                  <Trash2 aria-hidden /> شيل الصورة
                </Button>
              )}
            </div>
            {image && <img src={image} alt="مرجع الدرس" className="max-h-64 w-fit rounded-lg border" />}
          </div>

          <div className="flex items-center gap-3 lg:col-span-2">
            <Button size="lg" onClick={save} disabled={pending || loading}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} احفظ
            </Button>
            {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  )
}
