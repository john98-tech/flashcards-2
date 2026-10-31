'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, Check, Sparkles, X } from 'lucide-react'
import { completeOnboarding } from '@/app/actions'
import { endDemo, startDemo, useDemoState } from '@/lib/demo-tour'

type TourStep = {
  title: string
  body: string
  selector?: string
  action?: string
  /** Advance automatically once this part of the demo state is reached. */
  until?: 'unlocked'
  route: 'home' | 'deck' | 'any'
}

const baseSteps: TourStep[] = [
  {
    title: 'أهلًا بيك في كارت وكتاب',
    body: 'جولة سريعة هنجرب فيها مجموعة تجريبية، وبتتشال أول ما تخلص.',
    route: 'home',
  },
  {
    title: 'افتح مجموعة',
    body: 'دي مجموعة تجريبية. اضغط عليها تشوف الدِكات اللي جواها.',
    selector: '[data-tour="group-card"]',
    action: 'open-group',
    route: 'home',
  },
  {
    title: 'دِك مدفوع',
    body: 'الدِك ده عليه علامة Paid، يعني محتاج كود وصول. افتحه.',
    selector: '[data-tour="deck-card"]',
    action: 'open-deck',
    route: 'home',
  },
  {
    title: 'اطلب كود تجريبي',
    body: 'الأكواد بتوصلك على واتساب. اضغط الزرار عشان يبعتلك كود تجريبي.',
    selector: '[data-tour="demo-request"]',
    action: 'request-demo-code',
    route: 'deck',
  },
  {
    title: 'وصلتك رسالة',
    body: 'جالك إشعار من واتساب. اضغط عليه عشان تفتح الرسالة.',
    selector: '[data-tour="whatsapp-notification"]',
    action: 'open-whatsapp',
    route: 'deck',
  },
  {
    title: 'انسخ الكود',
    body: 'دي رسالة كارت وكتاب فيها الكود. اضغط «نسخ الكود».',
    selector: '[data-tour="whatsapp-copy"]',
    action: 'copy-code',
    route: 'deck',
  },
  {
    title: 'ارجع للتطبيق',
    body: 'اضغط السهم للرجوع من واتساب.',
    selector: '[data-tour="whatsapp-close"]',
    action: 'close-whatsapp',
    route: 'deck',
  },
  {
    title: 'الصق الكود',
    body: 'الصق الكود في خانة كود الوصول واضغط Unlock لفتح الدِك.',
    selector: '[data-tour="demo-code-form"]',
    until: 'unlocked',
    route: 'deck',
  },
  {
    title: 'اكشف الإجابة',
    body: 'اضغط على كلمة مخفية لتظهر.',
    selector: '[data-tour="study-reveal"]',
    action: 'reveal-word',
    route: 'deck',
  },
  {
    title: 'وضع الكتابة',
    body: 'اختار «اكتب الإجابة» عشان تختبر نفسك.',
    selector: '[data-tour="study-type-mode"]',
    action: 'select-type-mode',
    route: 'deck',
  },
  {
    title: 'لخبط الترتيب',
    body: 'اضغط «لخبط الترتيب» لتغيير ترتيب الكروت.',
    selector: '[data-tour="study-shuffle"]',
    action: 'shuffle-cards',
    route: 'deck',
  },
  {
    title: 'الإعدادات',
    body: 'افتحها للتحكم في الصوت والاختصارات.',
    selector: '[data-tour="settings-trigger"]',
    action: 'open-settings',
    route: 'any',
  },
  {
    title: 'الاختصارات',
    body: 'Space يكشف الكلمة التالية، وA يكشف الكل. بعد الكشف: ↑ أو Enter أو 2 = حفظتها، ↓ أو Backspace أو 1 = لسه. للتنقل: ← للكارت التالي و→ للسابق (أو N/P). T لتغيير الوضع، S لخلط الترتيب، R لإعادة الإخفاء.',
    selector: '[data-tour="settings-shortcuts"]',
    route: 'any',
  },
]

const finishStep: TourStep = {
  title: 'أنت جاهز!',
  body: 'ابدأ المراجعة، وتقدمك بيتحفظ تلقائيًا.',
  route: 'any',
}

function routeMatches(route: TourStep['route'], pathname: string) {
  if (route === 'any') return true
  if (route === 'home') return pathname === '/'
  if (route === 'deck') return pathname.startsWith('/decks/')
  return false
}

type Layout = {
  hx: number
  hy: number
  hw: number
  hh: number
  vw: number
  vh: number
  top: number
  left: number
  width: number
  below: boolean
  arrowX: number
}

function holePath(l: Layout) {
  const r = Math.min(14, l.hw / 2, l.hh / 2)
  const { hx: x, hy: y, hw: w, hh: h } = l
  return (
    `M0 0H${l.vw}V${l.vh}H0Z ` +
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  )
}

export function OnboardingTour({
  userId,
  completed,
}: {
  userId: string
  completed: boolean
  isAdmin?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const steps = useMemo(() => [...baseSteps, finishStep], [])
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [layout, setLayout] = useState<Layout | null>(null)
  const calloutRef = useRef<HTMLElement | null>(null)
  const [missingTarget, setMissingTarget] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState('')
  const demo = useDemoState()
  const step = steps[stepIndex]
  const isFinalStep = stepIndex === steps.length - 1

  useEffect(() => {
    if (!completed) {
      startDemo()
      setActive(true)
    }
  }, [completed, userId])

  useEffect(() => {
    const restart = () => {
      setStepIndex(0)
      setError('')
      startDemo()
      setActive(true)
    }
    window.addEventListener('sammaa-tour-restart', restart)
    return () => window.removeEventListener('sammaa-tour-restart', restart)
  }, [])

  // Take the user to the page a step explains, automatically.
  useEffect(() => {
    if (!active || !step || routeMatches(step.route, pathname)) return

    if (step.route === 'home') {
      router.push('/')
      return
    }
    // step.route === 'deck'
    if (pathname !== '/') {
      router.push('/')
      return
    }
    let attempts = 0
    let opened = false
    const timer = window.setInterval(() => {
      attempts++
      const deckLink = document.querySelector<HTMLAnchorElement>('a[data-tour="deck-card"]')
      if (deckLink) {
        window.clearInterval(timer)
        router.push(deckLink.getAttribute('href') ?? '/')
        return
      }
      if (!opened) {
        const group = document.querySelector<HTMLElement>('[data-tour="group-card"]')
        if (group) {
          opened = true
          group.click()
        }
      }
      if (attempts > 40) window.clearInterval(timer)
    }, 100)
    return () => window.clearInterval(timer)
  }, [active, step, pathname, router])

  // Find the target, then track it every frame so the frame stays exact
  // while zooming, scrolling, resizing or rotating a phone.
  useEffect(() => {
    if (!active || !step) return
    setLayout(null)
    setMissingTarget(false)
    if (!step.selector) return
    if (!routeMatches(step.route, pathname)) return

    let frame = 0
    let found = false
    let scrolled = false
    const startedAt = performance.now()
    let last = ''

    const tick = () => {
      const target = document.querySelector<HTMLElement>(step.selector!)
      if (target && target.isConnected) {
        if (!found) {
          found = true
          setMissingTarget(false)
        }
        if (!scrolled) {
          scrolled = true
          target.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
        const r = target.getBoundingClientRect()
        const vw = document.documentElement.clientWidth
        const vh = window.innerHeight
        const callout = calloutRef.current
        const ch = callout?.offsetHeight || 96
        const cw = Math.min(280, vw - 20)
        const pad = 6
        const hx = r.left - pad
        const hy = r.top - pad
        const hw = r.width + pad * 2
        const hh = r.height + pad * 2
        const below = vh - (hy + hh) >= ch + 24 || vh - (hy + hh) >= hy
        let top = below ? hy + hh + 12 : hy - 12 - ch
        top = Math.max(8, Math.min(top, vh - ch - 8))
        const center = hx + hw / 2
        const left = Math.max(10, Math.min(center - cw / 2, vw - cw - 10))
        const arrowX = Math.max(18, Math.min(center - left, cw - 18))
        const next: Layout = {
          hx: Math.round(hx * 2) / 2,
          hy: Math.round(hy * 2) / 2,
          hw: Math.round(hw * 2) / 2,
          hh: Math.round(hh * 2) / 2,
          vw,
          vh,
          top: Math.round(top),
          left: Math.round(left),
          width: cw,
          below,
          arrowX: Math.round(arrowX),
        }
        const key = JSON.stringify(next)
        if (key !== last) {
          last = key
          setLayout(next)
        }
      } else if (!found && performance.now() - startedAt > 3000) {
        setMissingTarget(true)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, pathname, step])

  // Advance automatically when the user performs the step's action.
  useEffect(() => {
    if (!active || !step?.action) return
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const action = target.closest<HTMLElement>('[data-tour-action]')?.dataset.tourAction
      if (action !== step.action) return
      setStepIndex((index) => Math.min(index + 1, steps.length - 1))
      setError('')
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [active, step, steps.length])

  // Advance automatically when the demo reaches the state the step waits for.
  useEffect(() => {
    if (!active || step?.until !== 'unlocked' || !demo.unlocked) return
    setStepIndex((index) => Math.min(index + 1, steps.length - 1))
    setError('')
  }, [active, step, demo.unlocked, steps.length])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void finishTour()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active])

  const advance = () => {
    setStepIndex((index) => Math.min(index + 1, steps.length - 1))
    setError('')
  }

  const finishTour = async () => {
    if (finishing) return
    setFinishing(true)
    setError('')
    try {
      await completeOnboarding()
      setActive(false)
      endDemo()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your tutorial progress.')
    } finally {
      setFinishing(false)
    }
  }

  if (!active || !step) return null

  const waitingForAction = (!!step.action || !!step.until) && !missingTarget
  const hasTarget = !!step.selector && !!layout && !missingTarget
  const placed = hasTarget && layout
    ? { top: layout.top, left: layout.left, width: layout.width }
    : undefined

  return (
    <div className="tour-layer" aria-live="polite">
      <div
        className="tour-dim"
        style={
          hasTarget && layout
            ? { clipPath: `path(evenodd, '${holePath(layout)}')` }
            : undefined
        }
      />
      {hasTarget && layout && (
        <div
          className="tour-spotlight"
          style={{ left: layout.hx, top: layout.hy, width: layout.hw, height: layout.hh }}
        />
      )}
      <section
        ref={calloutRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        dir="rtl"
        className={`tour-bar ${isFinalStep ? 'tour-bar-finale' : ''} ${hasTarget ? '' : 'tour-bar-center'}`}
        style={placed}
      >
        {hasTarget && layout && (
          <span
            className={`tour-arrow ${layout.below ? 'tour-arrow-up' : 'tour-arrow-down'}`}
            style={{ left: layout.arrowX }}
            aria-hidden
          />
        )}
        <div className="tour-bar-head">
          <span className="tour-bar-icon" aria-hidden>
            {isFinalStep ? <Check className="size-3.5" /> : <Sparkles className="size-3.5" />}
          </span>
          <h2 id="tour-title" className="tour-bar-title">
            {waitingForAction && <span className="tour-pulse-dot" aria-hidden />}
            {step.title}
          </h2>
          {!isFinalStep && (
            <button type="button" className="tour-bar-close" onClick={() => void finishTour()} disabled={finishing} aria-label="تخطي الجولة">
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <p className="tour-bar-body">
          {missingTarget && step.selector ? 'العنصر مش ظاهر هنا، كمّل للخطوة اللي بعدها.' : step.body}
        </p>
        {error && <p role="alert" className="tour-bar-error">{error}</p>}
        <div className="tour-bar-foot">
          <span className="tour-bar-count">{isFinalStep ? steps.length : stepIndex + 1}/{steps.length}</span>
          {isFinalStep ? (
            <button type="button" className="tour-bar-button" onClick={() => void finishTour()} disabled={finishing}>
              {finishing ? '…' : 'ابدأ'}
            </button>
          ) : waitingForAction ? null : (
            <button type="button" className="tour-bar-button" onClick={advance} aria-label="الخطوة التالية">
              التالي <ArrowLeft className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <span className="tour-bar-progress" aria-hidden style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
      </section>
    </div>
  )
}
