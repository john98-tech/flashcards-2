'use client'

import { useCallback, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Layers } from 'lucide-react'
import { GroupBrowser } from '@/components/group-browser'
import { RedeemForm } from '@/components/redeem-form'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { useDemoState } from '@/lib/demo-tour'
import { sfx, unlockAudio } from '@/lib/sound'

type BrowserDeck = DeckSummary & { open: boolean }
type BrowserGroup = DeckGroup & { decks: BrowserDeck[] }

type Props = {
  groups: BrowserGroup[]
  hasPaid: boolean
}

export function HomeHub({ groups, hasPaid }: Props) {
  const demo = useDemoState()
  const [showCards, setShowCards] = useState(false)
  const cardsVisible = showCards || demo.active

  const openCards = useCallback(() => {
    unlockAudio()
    sfx.unlock()
    setShowCards(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const backToHub = useCallback(() => {
    sfx.whoosh()
    setShowCards(false)
  }, [])

  if (cardsVisible) {
    return (
      <div className="home-enter">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={backToHub}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            رجوع
          </button>
          {hasPaid && <RedeemForm className="w-full rounded-xl border bg-card p-4 md:max-w-sm" />}
        </div>
        <GroupBrowser groups={groups} />
      </div>
    )
  }

  return (
    <div className="hub-wrap">
      <div className="hub-hero">
        <span className="hub-badge">Kart w Ketab</span>
        <h1 className="hub-title text-gradient" dir="rtl">ابدأ مذاكرتك</h1>
        <p className="hub-sub" dir="rtl">كل الكروت والمواد في مكان واحد</p>
      </div>
      <div className="hub-grid">
        <HubCard onClick={openCards} />
      </div>
    </div>
  )
}

function HubCard({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLElement | null>(null)

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${x * 100}%`)
    el.style.setProperty('--my', `${y * 100}%`)
    el.style.setProperty('--rx', `${(0.5 - y) * 9}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 11}deg`)
  }

  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  return (
    <button
      type="button"
      ref={(node) => { ref.current = node }}
      onClick={() => {
        unlockAudio()
        sfx.success()
        onClick()
      }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="hub-card hub-card-teal"
      data-tour="hub-cards"
      data-n="01"
    >
      <span className="hub-card-glow" aria-hidden />
      <span className="hub-icon"><Layers className="size-8" aria-hidden /></span>
      <span className="hub-card-title" dir="rtl">تسميع بالفلاش كاردس</span>
      <span className="hub-card-desc" dir="rtl">كروت تفاعلية فيها الجمل زي الكتاب والكلمات المهمة فاضية للمراجعة والتسميع.</span>
      <span className="hub-cta" dir="rtl">
        ابدأ بالكروت
        <ArrowRight className="size-4 rotate-180" aria-hidden />
      </span>
    </button>
  )
}
