'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { ImagePlus, MessageCircle, Mic, Paperclip, Send, Square, X, Trash2, Play } from 'lucide-react'
import { loadFeedbackMessages, sendFeedbackAttachment, sendFeedbackMessage, type FeedbackMessage } from '@/app/feedback/actions'

const STORAGE_KEY = 'kart-ketab-feedback-thread-v1'
const THREAD_STARTED_KEY = 'kart-ketab-feedback-thread-started-v1'
const THREAD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_FILE_SIZE = 8 * 1024 * 1024

function getThreadId() {
  try {
    const now = Date.now()
    const startedAt = Number(window.localStorage.getItem(THREAD_STARTED_KEY) || 0)
    let id = window.localStorage.getItem(STORAGE_KEY)
    if (!id || !startedAt || now - startedAt >= THREAD_MAX_AGE_MS) {
      id = window.crypto.randomUUID()
      window.localStorage.setItem(STORAGE_KEY, id)
      window.localStorage.setItem(THREAD_STARTED_KEY, String(now))
    }
    return id
  } catch { return '' }
}

function Attachment({ item }: { item: FeedbackMessage }) {
  if (!item.attachment_url) return null
  if (item.attachment_type === 'image') {
    return <a href={item.attachment_url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.attachment_url} alt={item.attachment_name || 'صورة مرفقة'} className="max-h-56 w-full object-contain" loading="lazy" />
    </a>
  }
  if (item.attachment_type === 'audio') return <audio controls preload="metadata" src={item.attachment_url} className="mt-2 block max-w-full" />
  return <a href={item.attachment_url} target="_blank" rel="noreferrer" className="mt-2 underline">عرض المرفق</a>
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const initialLoadDoneRef = useRef(false)
  const seenMessageIdsRef = useRef<Set<number>>(new Set())
  const originalTitleRef = useRef('')
  const originalFaviconRef = useRef<string | null>(null)
  const [threadId, setThreadId] = useState('')
  const [messages, setMessages] = useState<FeedbackMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [pending, startTransition] = useTransition()
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [selectedImageUrl, setSelectedImageUrl] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null)
  const [recordingUrl, setRecordingUrl] = useState('')
  const [recordSeconds, setRecordSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const playNotificationSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return
      const context = new AudioContextClass()
      if (context.state === 'suspended') void context.resume()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, context.currentTime)
      oscillator.frequency.setValueAtTime(660, context.currentTime + 0.12)
      gain.gain.setValueAtTime(0.0001, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3)
      oscillator.connect(gain); gain.connect(context.destination)
      oscillator.start(); oscillator.stop(context.currentTime + 0.32)
      oscillator.onended = () => void context.close()
    } catch { /* Audio may be blocked until the user interacts with the page. */ }
  }, [])

  const refresh = useCallback(async (id: string) => {
    if (!id) return
    try {
      const loaded = await loadFeedbackMessages(id)
      const knownIds = seenMessageIdsRef.current
      if (initialLoadDoneRef.current) {
        const incoming = loaded.filter(message => message.sender_role === 'admin' && !knownIds.has(message.id))
        if (incoming.length) {
          setUnreadCount(count => count + incoming.length)
          playNotificationSound()
        }
      } else {
        initialLoadDoneRef.current = true
      }
      loaded.forEach(message => knownIds.add(message.id))
      setMessages(loaded)
      setError('')
    } catch { setError('تعذر تحميل الرسائل. تأكد من إعداد التعليقات في قاعدة البيانات.') }
  }, [playNotificationSound])

  useEffect(() => { const id = getThreadId(); setThreadId(id); setReady(true); if (id) void refresh(id) }, [refresh])
  useEffect(() => {
    if (!threadId) return
    const interval = window.setInterval(() => void refresh(threadId), 8000)
    return () => window.clearInterval(interval)
  }, [threadId, refresh])

  useEffect(() => {
    if (!ready) return
    const baseTitle = 'كارت وكتاب | فلاش كاردز طبية وتسميع ذكي'
    originalTitleRef.current = baseTitle
    originalFaviconRef.current = '/favicon.svg?v=2'

    const applyTitle = () => {
      const nextTitle = unreadCount > 0
        ? `(${unreadCount > 9 ? '9+' : unreadCount}) رسالة جديدة | ${baseTitle}`
        : baseTitle
      if (document.title !== nextTitle) document.title = nextTitle

      const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
      if (!icon) return
      if (unreadCount > 0) {
        const badge = unreadCount > 9 ? '9+' : String(unreadCount)
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="16" fill="#075e54"/><path d="M14 18c7-3 13-2 18 2v27c-5-4-11-5-18-2z" fill="#fff"/><path d="M50 18c-7-3-13-2-18 2v27c5-4 11-5 18-2z" fill="#d9fdd3"/><path d="M32 20v27" stroke="#075e54" stroke-width="2"/><circle cx="49" cy="15" r="14" fill="#ef4444" stroke="#fff" stroke-width="3"/><text x="49" y="${badge.length > 1 ? 19 : 20}" font-size="${badge.length > 1 ? 10 : 14}" font-family="Arial,sans-serif" font-weight="bold" text-anchor="middle" fill="#fff">${badge}</text></svg>`
        const nextHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        if (icon.href !== nextHref) icon.href = nextHref
      } else if (!icon.href.endsWith('/favicon.svg?v=2')) {
        icon.href = '/favicon.svg?v=2'
      }
    }

    applyTitle()
    const observer = new MutationObserver(applyTitle)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [unreadCount, ready])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open, pending, selectedImage, recordedAudio])
  useEffect(() => {
    if (!selectedImage) { setSelectedImageUrl(''); return }
    const url = URL.createObjectURL(selectedImage)
    setSelectedImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedImage])
  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
  }, [recordingUrl])

  function clearAttachmentDraft() {
    setSelectedImage(null)
    setRecordedAudio(null)
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    setRecordingUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function send() {
    if (pending || !threadId) return
    if (!draft.trim() && !selectedImage && !recordedAudio) return
    setError('')
    const pagePath = window.location.pathname + window.location.search
    const pageTitle = document.title || pagePath
    const message = draft.trim()
    startTransition(async () => {
      try {
        let result: { ok: true } | { ok: false; error: string }
        if (selectedImage || recordedAudio) {
          const file = selectedImage ?? new File([recordedAudio!], `voice-message-${Date.now()}.webm`, { type: recordedAudio!.type || 'audio/webm' })
          result = await sendFeedbackAttachment({ threadId, file, kind: selectedImage ? 'image' : 'audio', message, pagePath, pageTitle })
        } else {
          result = await sendFeedbackMessage({ threadId, message, pagePath, pageTitle })
        }
        if (!result.ok) { setError(result.error); return }
        setDraft('')
        clearAttachmentDraft()
        await refresh(threadId)
      } catch {
        setError('حصلت مشكلة أثناء الإرسال. حاول مرة تانية.')
      }
    })
  }

  async function startRecording() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('المتصفح لا يدعم تسجيل الصوت. جرّب Chrome أو Edge وحدّث الصفحة عبر اتصال آمن.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > MAX_FILE_SIZE) {
          setError('التسجيل أكبر من 8 ميجابايت. سجّل رسالة أقصر.')
          setRecordedAudio(null)
          return
        }
        setRecordedAudio(blob)
        setRecordingUrl(URL.createObjectURL(blob))
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      timerRef.current = window.setInterval(() => setRecordSeconds(value => value + 1), 1000)
    } catch {
      setError('اسمح للموقع باستخدام الميكروفون من إعدادات المتصفح، ثم حاول مرة أخرى.')
    }
  }

  function stopRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setRecording(false)
  }

  function chooseImage(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('اختار ملف صورة فقط.'); return }
    if (file.size > MAX_FILE_SIZE) { setError('حجم الصورة لازم يكون 8 ميجابايت أو أقل.'); return }
    setError('')
    setRecordedAudio(null)
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    setRecordingUrl('')
    setSelectedImage(file)
  }

  const formatDuration = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

  return <div className="feedback-widget-root flex flex-col items-start gap-3" dir="rtl" style={{ position: 'fixed', right: '20px', left: 'auto', bottom: '156px', zIndex: 99999, isolation: 'isolate' }}>
    {open && <section className="feedback-chat-window fixed flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl" style={{ right: 'max(12px, env(safe-area-inset-right))', bottom: 'calc(max(12px, env(safe-area-inset-bottom)) + 84px)', width: 'min(400px, calc(100vw - 24px))', height: 'min(620px, calc(100dvh - max(24px, env(safe-area-inset-top)) - max(108px, calc(env(safe-area-inset-bottom) + 108px))))', maxHeight: 'calc(100dvh - max(24px, env(safe-area-inset-top)) - max(108px, calc(env(safe-area-inset-bottom) + 108px)))', zIndex: 100001 }} aria-label="محادثة التعليقات">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-[#075e54] px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15"><MessageCircle className="size-5" /></span>
          <div className="min-w-0"><h2 className="font-bold">تعليقات ودعم الموقع</h2><p className="mt-1 text-xs text-white/80">ابعت سؤالك أو المشكلة من الصفحة الحالية</p></div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق المحادثة" className="rounded-full p-2 hover:bg-white/15"><X className="size-5" /></button>
      </header>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-[#efeae2] p-3" style={{ backgroundImage: 'radial-gradient(rgba(100,90,75,.07) .7px, transparent .7px)', backgroundSize: '12px 12px' }}>
        {!messages.length && <p className="mx-auto mt-5 max-w-[90%] rounded-xl bg-[#fff8c5] p-3 text-center text-xs leading-6 text-stone-700 shadow-sm">أهلًا بيك 👋 اكتب رسالتك أو ابعت صورة أو رسالة صوتية. المحادثة محفوظة وهتقدر تتابع الردود من هنا.</p>}
        {messages.map((item, index) => {
          const currentDate = new Date(item.created_at)
          const previousDate = index > 0 ? new Date(messages[index - 1].created_at) : null
          const dayKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`
          const previousDayKey = previousDate ? `${previousDate.getFullYear()}-${previousDate.getMonth()}-${previousDate.getDate()}` : ''
          const showDate = index === 0 || dayKey !== previousDayKey
          const today = new Date()
          const isToday = dayKey === `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
          const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
          const isYesterday = dayKey === `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`
          const dateLabel = isToday ? 'اليوم' : isYesterday ? 'أمس' : currentDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
          return <div key={item.id}>
          {showDate && <div className="sticky top-0 z-10 my-2 flex justify-center"><span className="rounded-lg bg-[#dfe8df] px-3 py-1 text-[11px] font-semibold text-stone-700 shadow-sm">{dateLabel}</span></div>}
          <article className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-sm shadow-sm ${item.sender_role === 'admin' ? 'ml-auto rounded-tr-sm bg-[#d9fdd3] text-stone-900' : 'mr-auto rounded-tl-sm bg-white text-stone-900'}`}>
          <p className="mb-1 text-[11px] font-bold text-[#075e54]">{item.sender_role === 'admin' ? 'الإدارة' : 'أنت'}</p>
          {item.message && !((item.attachment_type === 'image' && item.message === 'صورة مرفقة') || (item.attachment_type === 'audio' && item.message === 'رسالة صوتية')) && <p className="whitespace-pre-wrap break-words leading-6">{item.message}</p>}
          <Attachment item={item} />
          {item.page_path && item.sender_role === 'user' && <p className="mt-2 border-t border-stone-900/10 pt-1.5 text-[10px] opacity-65">الصفحة: {item.page_title || item.page_path}<br />{item.page_path}</p>}
          <time dateTime={item.created_at} className="mt-1 block text-left text-[10px] text-stone-500">{new Date(item.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</time>
        </article>
          </div>
        })}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      </div>
      <form className="border-t border-border bg-[#f7f7f7] p-2.5" onSubmit={event => { event.preventDefault(); if (recording) stopRecording(); else send() }}>
        {(selectedImage || recordedAudio) && <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border bg-white p-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            {selectedImage ? <ImagePlus className="size-5 shrink-0 text-[#075e54]" /> : <Play className="size-5 shrink-0 text-[#075e54]" />}
            <span className="truncate">{selectedImage?.name || 'رسالة صوتية جاهزة للإرسال'}</span>
            {recordedAudio && recordingUrl && <audio controls src={recordingUrl} className="max-w-[140px]" />}
          </div>
          <button type="button" onClick={clearAttachmentDraft} className="rounded-full p-1.5 hover:bg-muted" aria-label="إلغاء المرفق"><Trash2 className="size-4" /></button>
        </div>}
        {selectedImage && <div className="mb-2 max-h-28 overflow-hidden rounded-xl bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={URL.createObjectURL(selectedImage)} alt="معاينة الصورة" className="max-h-28 max-w-full object-contain" />
        </div>}
        {recording && <div className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-red-50 p-2 text-sm text-red-700"><span className="size-2 animate-pulse rounded-full bg-red-600" /> جاري التسجيل {formatDuration(recordSeconds)} — اضغط المربع للإيقاف</div>}
        <div className="flex items-end gap-1.5">
          {recording
            ? <button type="button" onClick={stopRecording} aria-label="إيقاف التسجيل" className="grid size-10 shrink-0 place-items-center rounded-full bg-red-600 text-white hover:bg-red-700"><Square className="size-4 fill-current" /></button>
            : (draft.trim() || selectedImage || recordedAudio)
              ? <button type="submit" disabled={!ready || pending || !threadId} aria-label="إرسال الرسالة" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#128c7e] text-white hover:bg-[#075e54] disabled:opacity-40"><Send className="size-4" /></button>
              : <button type="button" onClick={() => void startRecording()} disabled={!ready || pending} aria-label="تسجيل رسالة صوتية" title="تسجيل رسالة صوتية" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#128c7e] text-white hover:bg-[#075e54] disabled:opacity-40"><Mic className="size-5" /></button>}
          <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (recording) stopRecording(); else send() } }} maxLength={2000} rows={1} placeholder="اكتب رسالة..." className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-[#128c7e] focus:ring-1 focus:ring-[#128c7e]" aria-label="اكتب تعليقك" />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={event => chooseImage(event.target.files?.[0])} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={pending || recording} className="grid size-10 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-stone-200 disabled:opacity-40" aria-label="إرفاق صورة" title="إرفاق صورة"><Paperclip className="size-5" /></button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-stone-500">Enter للإرسال · Shift + Enter لسطر جديد</p>
      </form>
    </section>}
    <button type="button" onClick={() => { const nextOpen = !open; setOpen(nextOpen); if (nextOpen) setUnreadCount(0) }} className="floating-contact-button relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#075e54] text-white shadow-lg ring-2 ring-white/90 transition duration-300 hover:-translate-y-1 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075e54] focus-visible:ring-offset-2" aria-expanded={open} aria-label={open ? 'إغلاق التعليقات' : 'تعليقات الموقع'} title="تعليقات الموقع" style={{ zIndex: 100000, visibility: 'visible', opacity: 1 }}>
      {!open && (unreadCount > 0
        ? <span className="feedback-message-hint" aria-live="polite">رسالة جديدة</span>
        : <span className="floating-contact-hint floating-contact-hint-feedback" aria-hidden="true">اترك تعليقك</span>)}
      {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      {unreadCount > 0 && !open && <span className="absolute -right-1 -top-1 grid min-h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-xs font-extrabold leading-none text-white shadow-md" aria-label={`${unreadCount} رسالة غير مقروءة`}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
  </div>
}
