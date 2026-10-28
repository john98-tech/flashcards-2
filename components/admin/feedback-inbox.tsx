'use client'

import { useMemo, useState, useTransition } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { replyToFeedback, type FeedbackMessage } from '@/app/feedback/actions'

function MessageAttachment({ row }: { row: FeedbackMessage }) {
  if (!row.attachment_url) return null
  if (row.attachment_type === 'image') return <a href={row.attachment_url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={row.attachment_url} alt={row.attachment_name || 'صورة مرفقة'} className="max-h-72 max-w-full rounded-xl object-contain" loading="lazy" />
  </a>
  if (row.attachment_type === 'audio') return <audio controls preload="metadata" src={row.attachment_url} className="mt-2 block max-w-full" />
  return null
}

export function FeedbackInbox({ initialMessages }: { initialMessages: FeedbackMessage[] }) {
  const [messages, setMessages] = useState(initialMessages)
  const [selected, setSelected] = useState(initialMessages[0]?.thread_id ?? '')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const threads = useMemo(() => {
    const map = new Map<string, FeedbackMessage[]>()
    for (const message of messages) map.set(message.thread_id, [...(map.get(message.thread_id) ?? []), message])
    return [...map.entries()].map(([id, rows]) => ({ id, rows, latest: rows[rows.length - 1] })).sort((a,b) => Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at))
  }, [messages])
  const active = threads.find(thread => thread.id === selected) ?? threads[0]

  function sendReply() {
    if (!active || !draft.trim() || pending) return
    const threadId = active.id, message = draft.trim()
    setError('')
    startTransition(async () => {
      try {
        await replyToFeedback({ threadId, message })
        setMessages(current => [...current, { id: Date.now(), thread_id: threadId, sender_role: 'admin', message, page_path: null, page_title: null, created_at: new Date().toISOString() }])
        setDraft('')
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر إرسال الرد.') }
    })
  }

  return <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.5fr)]">
    <aside className="space-y-2"><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><MessageSquare className="size-5" /> المحادثات ({threads.length})</h2>
      {!threads.length && <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">لسه مفيش تعليقات. أول ما مستخدم يكتب من الموقع هتظهر المحادثة هنا.</p>}
      {threads.map(thread => <button key={thread.id} type="button" onClick={() => setSelected(thread.id)} className={`w-full rounded-xl border p-3 text-right transition-colors ${active?.id === thread.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted'}`}>
        <span className="block text-xs text-muted-foreground">{thread.latest.page_title || thread.latest.page_path || 'محادثة'}</span><span className="mt-1 block truncate text-sm font-semibold">{thread.latest.attachment_type === 'image' ? '📷 صورة' : thread.latest.attachment_type === 'audio' ? '🎤 رسالة صوتية' : thread.latest.message}</span>
        <span className="mt-2 block text-[11px] text-muted-foreground">{new Date(thread.latest.created_at).toLocaleString('ar-EG')} · {thread.rows.length} رسالة</span>
        {thread.latest.sender_role === 'user' && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">محتاج رد</span>}
      </button>)}
    </aside>
    <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {active ? <>
        <header className="border-b border-border p-4"><h2 className="font-bold">{active.rows.find(row => row.page_title)?.page_title || 'محادثة مستخدم'}</h2><p className="mt-1 break-all text-xs text-muted-foreground">رابط الصفحة: {active.rows.find(row => row.page_path)?.page_path || 'غير متوفر'}</p><p className="mt-1 break-all text-[10px] text-muted-foreground">معرّف المحادثة: {active.id}</p></header>
        <div className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">{active.rows.map(row => <article key={row.id} className={`max-w-[88%] rounded-2xl p-3 text-sm ${row.sender_role === 'admin' ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto border border-border bg-card'}`}>
          <p className="mb-1 text-xs font-bold opacity-75">{row.sender_role === 'admin' ? 'أنت (الإدارة)' : 'المستخدم'}</p><p className="whitespace-pre-wrap break-words leading-6">{row.message}</p><MessageAttachment row={row} />
          {row.page_path && <p className="mt-2 border-t border-current/15 pt-1 text-[10px] opacity-70">{row.page_title} — {row.page_path}</p>}<time className="mt-1 block text-[10px] opacity-60">{new Date(row.created_at).toLocaleString('ar-EG')}</time>
        </article>)}</div>
        <form onSubmit={event => { event.preventDefault(); sendReply() }} className="flex items-end gap-2 border-t border-border p-3"><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendReply() } }} maxLength={2000} rows={2} placeholder="اكتب ردك للمستخدم..." className="min-h-12 flex-1 resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /><button type="submit" disabled={pending || !draft.trim()} className="ux-btn inline-flex size-11 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed" aria-label="إرسال الرد"><Send className="size-4" /></button></form>
        {error && <p role="alert" className="px-3 pb-3 text-sm text-destructive">{error}</p>}
      </> : <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">اختار محادثة من القائمة علشان تقرأ التعليقات وترد عليها.</div>}
    </section>
  </div>
}
