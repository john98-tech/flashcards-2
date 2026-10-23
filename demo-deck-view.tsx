'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Copy, KeyRound, Lock, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StudySession } from '@/components/study-session'
import { DEMO_CODE, demoDeck, isDemoCode } from '@/lib/demo-data'
import { patchDemo, useDemoState } from '@/lib/demo-tour'

/**
 * The tutorial's demo deck page. It only exists while the guided tour runs:
 * the deck starts locked (paid), the trial code "arrives" as a WhatsApp
 * message, and entering it unlocks the deck.
 */
export function DemoDeckView() {
  const router = useRouter()
  const demo = useDemoState()
  const [requesting, setRequesting] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)

  // The demo only exists during the tour; anyone landing here otherwise goes home.
  useEffect(() => {
    if (!demo.active) router.replace('/')
  }, [demo.active, router])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // A restarted tour must always begin with a fresh, locked deck.
  useEffect(() => {
    if (!demo.codeSent) {
      setRequesting(false)
      setNotificationOpen(false)
      setChatOpen(false)
      setCopied(false)
      setCode('')
      setMessage('')
    }
  }, [demo.codeSent])

  if (!demo.active) return null

  if (demo.unlocked) return <StudySession deck={demoDeck} />

  const requestCode = () => {
    if (requesting) return
    setRequesting(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      patchDemo({ codeSent: true })
      setNotificationOpen(true)
      setRequesting(false)
    }, 900)
  }

  const openChat = () => {
    setNotificationOpen(false)
    setChatOpen(true)
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(DEMO_CODE)
    } catch {
      // Clipboard can be blocked; the code is still selectable in the message.
    }
    setCopied(true)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (isDemoCode(code)) {
      setMessage('')
      patchDemo({ unlocked: true })
    } else {
      setMessage('Invalid code. Copy it from the WhatsApp message.')
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
          <Lock className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-xl font-bold">This deck is paid content</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the access code you received to unlock it on this device.
          </p>
        </div>

        <Button
          type="button"
          onClick={requestCode}
          disabled={requesting}
          data-tour="demo-request"
          data-tour-action="request-demo-code"
          className="h-9 bg-[#25D366] px-4 text-white hover:bg-[#1fb957]"
        >
          <MessageCircle aria-hidden />
          {requesting ? 'Sending…' : 'Get a trial code on WhatsApp'}
        </Button>
        {demo.codeSent && !chatOpen && (
          <button
            type="button"
            onClick={openChat}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Open the WhatsApp message again
          </button>
        )}

        <form onSubmit={submit} data-tour="demo-code-form" className="flex w-full max-w-sm flex-col gap-2 text-left">
          <label htmlFor="demo-access-code" className="text-sm font-semibold">
            Have an access code?
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="demo-access-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX"
              className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-sm uppercase tracking-wider outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit">
              <KeyRound aria-hidden /> Unlock
            </Button>
          </div>
          <p role="status" className="min-h-4 text-xs text-destructive">
            {message}
          </p>
        </form>
      </div>

      {notificationOpen && !chatOpen && (
        <button
          type="button"
          onClick={openChat}
          data-tour="whatsapp-notification"
          data-tour-action="open-whatsapp"
          dir="rtl"
          className="fixed inset-x-3 top-3 z-[90] mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-white p-3 text-right shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white">
            <MessageCircle className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
              <span>واتساب</span>
              <span>الآن</span>
            </span>
            <span className="block truncate text-sm font-bold text-neutral-900">كارت وكتاب</span>
            <span className="block truncate text-sm text-neutral-600">بعتلك كود تجريبي 🔑 اضغط لفتح الرسالة</span>
          </span>
        </button>
      )}

      {chatOpen && (
        <div
          role="dialog"
          aria-label="WhatsApp"
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
        >
          <div className="flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#ECE5DD] animate-in fade-in zoom-in-95 duration-200 sm:h-[34rem] sm:rounded-2xl sm:shadow-2xl">
            <div className="flex items-center gap-3 bg-[#075E54] px-3 py-3 text-white">
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                data-tour="whatsapp-close"
                data-tour-action="close-whatsapp"
                aria-label="Back"
                className="flex size-8 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ArrowRight className="size-5 rotate-180" aria-hidden />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="size-9 rounded-full bg-white object-contain p-0.5" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">كارت وكتاب</p>
                <p className="text-[11px] text-white/75">متصل الآن</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4" dir="rtl">
              <p className="mx-auto mb-3 w-fit rounded-lg bg-[#FFF3C4] px-3 py-1 text-[11px] text-neutral-700">اليوم</p>
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-white p-3 text-sm leading-relaxed text-neutral-900 shadow-sm">
                <p>أهلًا بيك في كارت وكتاب 👋</p>
                <p className="mt-1">ده كود الوصول التجريبي بتاعك:</p>
                <p
                  dir="ltr"
                  data-tour="whatsapp-code"
                  className="my-2 select-all rounded-lg bg-neutral-100 px-3 py-2 text-center font-mono text-base font-bold tracking-widest"
                >
                  {DEMO_CODE}
                </p>
                <p>انسخه وحطه في خانة «كود الوصول» عشان تفتح الدِك وتكمل التجربة.</p>
                <p className="mt-1 text-left text-[10px] text-neutral-400" dir="ltr">
                  now
                </p>
              </div>

              <button
                type="button"
                onClick={() => void copyCode()}
                data-tour="whatsapp-copy"
                data-tour-action="copy-code"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1fb957] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54]"
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? 'تم النسخ' : 'نسخ الكود'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
