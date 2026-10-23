'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, KeyRound, Loader2, ShieldCheck, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_MODEL, FALLBACK_MODELS, listModels, useGeminiConfig } from '@/lib/gemini'

export function ApiKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config, save, clear } = useGeminiConfig()
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setApiKey(config?.apiKey ?? '')
    setModel(config?.model ?? DEFAULT_MODEL)
    setError('')
  }, [open, config])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = apiKey.trim()
    if (!key) return setError('اكتب المفتاح الأول.')
    setBusy(true)
    setError('')
    try {
      const available = await listModels(key)
      setModels(available)
      const chosen = available.includes(model) ? model : available.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : available[0]
      save({ apiKey: key, model: chosen })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحقق من المفتاح.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onPointerDown={onClose}>
      <form
        onSubmit={submit}
        onPointerDown={(e) => e.stopPropagation()}
        dir="rtl"
        className="w-full max-w-md rounded-t-2xl border bg-card p-5 shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="مفتاح Gemini"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-bold">مفتاح Gemini</h2>
              <p className="text-xs text-muted-foreground">علشان الذكاء الاصطناعي يصحح تسميعك</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <ol className="mb-4 list-decimal space-y-1 ps-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            افتح{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
              Google AI Studio <ExternalLink className="size-3" aria-hidden />
            </a>{' '}
            وسجّل بحساب جوجل.
          </li>
          <li>اضغط Create API key وانسخ المفتاح (مجاني).</li>
          <li>الصقه هنا واضغط حفظ.</li>
        </ol>

        <label className="mb-1 block text-sm font-medium" htmlFor="gemini-key">API Key</label>
        <input
          id="gemini-key"
          dir="ltr"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
          className="mb-3 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        <label className="mb-1 block text-sm font-medium" htmlFor="gemini-model">الموديل</label>
        <select
          id="gemini-model"
          dir="ltr"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {[...new Set([model, ...models])].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <p className="mb-4 flex items-start gap-2 rounded-lg bg-success/10 p-2.5 text-xs leading-relaxed text-success">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          المفتاح بيتحفظ على جهازك بس، والطلبات بتروح من متصفحك لجوجل مباشرة. مش بنخزنه ولا بنشوفه.
        </p>

        {error && <p role="alert" className="mb-3 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity', busy && 'opacity-70')}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            {busy ? 'بتحقق من المفتاح...' : 'تحقق واحفظ'}
          </button>
          {config && (
            <button
              type="button"
              onClick={() => {
                clear()
                setApiKey('')
              }}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" aria-hidden /> حذف
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
