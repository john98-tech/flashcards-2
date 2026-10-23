'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { FileText, Loader2, Save, Trash2, Upload } from 'lucide-react'
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
    setMsg('')
    try {
      if (file.type === 'application/pdf') {
        if (file.size > 8 * 1024 * 1024) {
          setMsg('حجم ملف PDF لازم يكون أقل من 8 ميجابايت.')
          return
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('bad pdf'))
          reader.onerror = () => reject(new Error('bad pdf'))
          reader.readAsDataURL(file)
        })
        setImage(dataUrl)
      } else if (file.type.startsWith('image/')) {
        setImage(await fileToCompressedDataUrl(file, 1800, 0.82))
      } else {
        setMsg('ارفع ملف PDF أو صورة فقط.')
      }
    } catch {
      setMsg('معرفتش أقرأ الملف ده.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
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

  const isPdf = image?.startsWith('data:application/pdf;')

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4" dir="rtl">
      <div>
        <h2 className="text-lg font-bold">إعدادات التسميع الكتابي</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          اختار الدرس، وحدد العناوين الرئيسية والفرعية اللي هتظهر للطالب، ثم أضف مرجع التصحيح كنص أو PDF أو صورة.
          Gemini هيقارن إجابة الطالب بالمرجع اللي تحدده هنا فقط.
        </p>
      </div>

      <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="w-full rounded-lg border bg-background p-2 text-sm sm:w-96" dir="auto">
        <option value="">اختار درس…</option>
        {decks.map((d) => <option key={d.id} value={d.id}>{d.groupName} — {d.title}</option>)}
      </select>

      {deckId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            العناوين الرئيسية والفرعية (عنوان في كل سطر، ابدأ السطر بـ - للعنوان الفرعي)
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
            <span className="text-sm font-semibold">ملف مرجعي (اختياري)</span>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden /> {image ? 'غيّر الملف المرجعي' : 'ارفع PDF أو صورة'}
              </Button>
              {image && <Button variant="outline" onClick={() => setImage(null)}><Trash2 aria-hidden /> شيل الملف</Button>}
            </div>
            {image && (isPdf
              ? <div className="flex items-center gap-3 rounded-lg border p-4 text-sm"><FileText className="size-8 text-primary" /><span>ملف PDF جاهز للتصحيح</span></div>
              : <img src={image} alt="مرجع الدرس" className="max-h-64 w-fit rounded-lg border" />)}
            <p className="text-xs text-muted-foreground">ملفات PDF حتى 8 ميجابايت. يمكن استخدام النص والملف معًا.</p>
          </div>

          <div className="flex items-center gap-3 lg:col-span-2">
            <Button size="lg" onClick={save} disabled={pending || loading || !deckId}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} احفظ
            </Button>
            {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  )
}
