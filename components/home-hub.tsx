'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, FolderOpen, Layers, PenLine, Sparkles } from 'lucide-react'
import { GroupBrowser } from '@/components/group-browser'
import { RedeemForm } from '@/components/redeem-form'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { useDemoState } from '@/lib/demo-tour'
import { sfx, unlockAudio } from '@/lib/sound'

type BrowserDeck = DeckSummary & { open: boolean }
type BrowserGroup = DeckGroup & { decks: BrowserDeck[] }

export type DictationHomeSubject = {
  id: string
  name: string
  lessons: { id: string; title: string; description: string }[]
}

type Props = {
  groups: BrowserGroup[]
  hasPaid: boolean
  dictation?: DictationHomeSubject[]
}

export function HomeHub({ groups, hasPaid, dictation = [] }: Props) {
  const demo = useDemoState()
  const [mode, setMode] = useState<'hub' | 'cards' | 'dictation'>('hub')
  const showCards = mode === 'cards' || demo.active

  // Deep link: /#flashcards opens the flashcards section directly.
  useEffect(() => {
    if (window.location.hash === '#flashcards') setMode('cards')
    if (window.location.hash === '#dictation') setMode('dictation')
  }, [])

  const openCards = useCallback(() => {
    unlockAudio()
    sfx.unlock()
    setMode('cards')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const openDictation = useCallback(() => {
    unlockAudio()
    sfx.unlock()
    setMode('dictation')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const backToHub = useCallback(() => {
    sfx.whoosh()
    setMode('hub')
  }, [])

  if (showCards) {
    return (
      <div className="home-enter">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={backToHub}
            className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-4 py-2 text-sm font-semibold text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            الرئيسية
          </button>
          {hasPaid && <RedeemForm className="w-full rounded-xl border bg-card p-4 md:max-w-sm" />}
        </div>
        <GroupBrowser groups={groups} />
      </div>
    )
  }

  if (mode === 'dictation') {
    return (
      <div className="home-enter">
        <div className="mb-6">
          <button
            type="button"
            onClick={backToHub}
            className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-4 py-2 text-sm font-semibold text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            الرئيسية
          </button>
        </div>
        <DictationSubjects subjects={dictation} />
      </div>
    )
  }

  return (
    <div className="hub-wrap">
      <div className="hub-hero">
        <span className="hub-badge">
          <Sparkles className="size-3.5" aria-hidden /> Kart w Ketab
        </span>
        <h1 className="hub-title text-gradient" dir="rtl">
          عايز تذاكر إزاي النهارده؟
        </h1>
        <p className="hub-sub" dir="rtl">اختار الطريقة اللي تريحك وابدأ على طول</p>
      </div>

      <div className="hub-grid">
        <HubCard
          tone="teal"
          icon={<Layers className="size-8" aria-hidden />}
          title="تسميع بالفلاش كاردس"
          desc="كروت فيها الجملة زي الكتاب بالظبط والكلمات المهمة فاضية. اكشفها أو اكتبها وراجع اللي مش حافظه بس."
          cta="ابدأ بالكروت"
          onClick={openCards}
          tourId="hub-cards"
        />
        <HubCard
          tone="coral"
          icon={<PenLine className="size-8" aria-hidden />}
          title="التسميع بالكتابة"
          desc="اختار المادة والدرس، واكتب اللي حافظه من غير كروت."
          cta="ابدأ التسميع"
          onClick={openDictation}
          tourId="hub-recite"
        />
      </div>
    </div>
  )
}

// Written dictation subjects and their lessons. Independent of the flashcards groups and decks.
function DictationSubjects({ subjects }: { subjects: DictationHomeSubject[] }) {
  if (subjects.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground" dir="rtl">
        لسه مفيش مواد في التسميع بالكتابة.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {subjects.map((subject) => (
        <section key={subject.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 border-b border-border/80 pb-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <FolderOpen className="size-5" aria-hidden />
            </span>
            <h2 className="truncate text-xl font-bold sm:text-2xl" dir="auto">{subject.name}</h2>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subject.lessons.map((lesson) => (
              <li key={lesson.id} className="flex h-full flex-col gap-1 rounded-xl border bg-card p-5">
                <h3 className="font-semibold" dir="auto">{lesson.title}</h3>
                {lesson.description && <p className="text-sm text-muted-foreground" dir="auto">{lesson.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function HubCard({
  tone,
  icon,
  title,
  desc,
  cta,
  href,
  onClick,
  tourId,
}: {
  tone: 'teal' | 'coral'
  icon: React.ReactNode
  title: string
  desc: string
  cta: string
  href?: string
  onClick?: () => void
  tourId?: string
}) {
  const ref = useRef<HTMLElement | null>(null)

  // 3D tilt + moving spotlight following the pointer.
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

  const inner = (
    <>
      <span className="hub-card-glow" aria-hidden />
      <span className="hub-icon">{icon}</span>
      <span className="hub-card-title" dir="rtl">{title}</span>
      <span className="hub-card-desc" dir="rtl">{desc}</span>
      <span className="hub-cta" dir="rtl">
        {cta}
        <ArrowRight className="size-4 rotate-180" aria-hidden />
      </span>
    </>
  )

  const common = {
    className: `hub-card hub-card-${tone}`,
    onPointerMove: onMove,
    onPointerLeave: onLeave,
    'data-tour': tourId,
  }

  if (href) {
    return (
      <Link
        href={href}
        ref={(n) => {
          ref.current = n
        }}
        onClick={() => {
          unlockAudio()
          sfx.success()
        }}
        {...common}
      >
        {inner}
      </Link>
    )
  }
  return (
    <button
      type="button"
      ref={(n) => {
        ref.current = n
      }}
      onClick={onClick}
      {...common}
    >
      {inner}
    </button>
  )
}
