'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { loadFeedbackMessages, sendFeedbackMessage, type FeedbackMessage } from '@/app/feedback/actions'

const STORAGE_KEY = 'kart-ketab-feedback-thread-v1'
function getThreadId() {
  try {
    let id = window.localStorage.getItem(STORAGE_KEY)
    if (!id) { id = window.crypto.randomUUID(); window.localStorage.setItem(STORAGE_KEY, id) }
    return id
  } catch { return '' }
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [threadId, setThreadId] = useState('')
  const [messages, setMessages] = useState<FeedbackMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [pending, startTransition] = useTransition()
  const refresh = useCallback(async (id: string) => {
    if (!id) return
    try { setMessages(await loadFeedbackMessages(id)); setError('') }
    catch { setError('تعذر تحميل الرسائل. تأكد من إعداد التعليقات في قاعدة البيانات.') }
  }, [])

  useEffect(() => { const id = getThreadId(); setThreadId(id); setReady(true); if (id) void refresh(id) }, [refresh])
  useEffect(() => {
    if (!open || !threadId) return
    void refresh(threadId)
    const interval = window.setInterval(() => void refresh(threadId), 10000)
    return () => window.clearInterval(interval)
  }, [open, threadId, refresh])

  function send() {
    const message = draft.trim()
    if (!message || pending || !threadId) return
    setError('')
    const pagePath = window.location.pathname + window.location.search
    const pageTitle = document.title || pagePath
    startTransition(async () => {
      const result = await sendFeedbackMessage({ threadId, message, pagePath, pageTitle })
      if (!result.ok) { setError(result.error); return }
      setDraft('')
      await refresh(threadId)
    })
  }

  return <div className="flex flex-col items-start gap-3" dir="rtl" style={{ position: "fixed", left: "20px", bottom: "20px", zIndex: 99999, isolation: "isolate" }}>
    {open && <section className="flex h-[min(76dvh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" aria-label="محادثة التعليقات">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div><h2 className="font-bold text-foreground">اقتراح أو مشكلة؟</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">علّق من نفس الصفحة اللي مضايقاك أو عايز تعدّل فيها. اسم الصفحة هيتبعت تلقائيًا، وتقدر تتابع الردود من هنا.</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق المحادثة" className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-3">
        {!messages.length && <p className="rounded-xl border border-dashed border-border bg-card p-4 text-sm leading-6 text-muted-foreground">لسه مفيش رسائل. اكتب المشكلة أو التعديل اللي محتاجه؛ الرسائل بتفضل محفوظة حتى بعد التحديث أو إغلاق الموقع.</p>}
        {messages.map(item => <article key={item.id} className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-sm shadow-sm ${item.sender_role === 'admin' ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto border border-border bg-card text-foreground'}`}>
          <p className="mb-1 text-[11px] font-bold opacity-75">{item.sender_role === 'admin' ? 'رد الإدارة' : 'أنت'}</p><p className="whitespace-pre-wrap break-words leading-6">{item.message}</p>
          {item.page_path && item.sender_role === 'user' && <p className="mt-2 border-t border-current/15 pt-1.5 text-[10px] opacity-75">الصفحة: {item.page_title || item.page_path}<br />{item.page_path}</p>}
          <time className="mt-1 block text-[10px] opacity-60">{new Date(item.created_at).toLocaleString('ar-EG')}</time>
        </article>)}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
      </div>
      <form className="flex items-end gap-2 border-t border-border bg-card p-3" onSubmit={event => { event.preventDefault(); send() }}>
        <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder="اكتب تعليقك أو التعديل المطلوب..." className="max-h-28 min-h-12 flex-1 resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" aria-label="اكتب تعليقك" />
        <button type="submit" disabled={!ready || pending || !draft.trim() || !threadId} aria-label="إرسال التعليق" className="ux-btn inline-flex size-11 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed"><Send className="size-4" /></button>
      </form>
    </section>}
    <button type="button" onClick={() => setOpen(value => !value)} className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-white px-5 py-3 text-sm font-bold shadow-2xl" style={{ background: "#2563eb", color: "#ffffff", boxShadow: "0 8px 28px rgba(0,0,0,.35)", position: "relative", zIndex: 100000, visibility: "visible", opacity: 1 }} aria-expanded={open}>
      {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}{open ? 'إغلاق' : 'تعليق / مشكلة'}
      {messages.some(message => message.sender_role === 'admin') && <span className="size-2 rounded-full bg-amber-300" aria-label="يوجد رد" />}
    </button>
  </div>
}
