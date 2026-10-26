'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, FolderOpen, KeyRound, Lock, PenLine, Sparkles, Trophy, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGeminiConfig } from '@/lib/gemini'
import { SectionSwitcher } from '@/components/section-switcher'
import { ApiKeyDialog } from '@/components/recite/api-key-dialog'

export type ReciteDeck = { id: string; title: string; subject: string; description: string; cardCount: number; open: boolean }
export type ReciteGroup = { id: string; name: string; decks: ReciteDeck[] }

function HeroSection({ onKeyClick, ready, config }: { onKeyClick: () => void; ready: boolean; config: unknown }) {
  return (
    <section className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-6 text-primary-foreground sm:p-8" dir="rtl">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 left-0 size-48 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <PenLine className="size-7" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">التسميع بالكتابة</h1>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-primary-foreground/80">
              اختار درس، اكتب كل اللي فاكره على صفحة بيضا بالكيبورد أو القلم، وGemini هيصحح لك الغلط والإملاء والنواقص.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                <Zap className="size-3.5" aria-hidden /> تصحيح بالذكاء الاصطناعي
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                <BookOpen className="size-3.5" aria-hidden /> كتابة + رسم
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                <Trophy className="size-3.5" aria-hidden /> تقرير مفصّل
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onKeyClick}
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-lg transition-all hover:scale-105 active:scale-95',
            ready && config
              ? 'bg-white text-success hover:bg-white/90'
              : 'bg-white text-primary hover:bg-white/90',
          )}
        >
          {ready && config ? (
            <><CheckCircle2 className="size-4 text-success" aria-hidden /> مفتاح Gemini جاهز</>
          ) : (
            <><KeyRound className="size-4" aria-hidden /> ضيف مفتاح Gemini</>
          )}
        </button>
      </div>
    </section>
  )
}

function StepGuide() {
  const steps = [
    { icon: <FolderOpen className="size-4" />, label: 'اختار المادة' },
    { icon: <BookOpen className="size-4" />, label: 'اختار الدرس' },
    { icon: <PenLine className="size-4" />, label: 'اكتب من دماغك' },
    { icon: <Sparkles className="size-4" />, label: 'اعرف نتيجتك' },
  ]
  return (
    <div className="mb-8 flex items-center justify-center gap-0" dir="rtl">
      {steps.map((s, i) => (
        <>
          <div key={s.label} className="flex flex-col items-center gap-1">
            <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground ring-2 ring-border">
              {s.icon}
            </span>
            <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div key={`sep-${i}`} className="mb-4 h-px w-8 shrink-0 bg-border sm:w-12" />
          )}
        </>
      ))}
    </div>
  )
}

export function ReciteBrowser({ groups }: { groups: ReciteGroup[] }) {
  const [groupId, setGroupId] = useState<string | null>(null)
  const [keyOpen, setKeyOpen] = useState(false)
  const { config, ready } = useGeminiConfig()
  const group = groups.find((g) => g.id === groupId)
  const totalDecks = groups.reduce((n, g) => n + g.decks.length, 0)
  const openDecks = groups.reduce((n, g) => n + g.decks.filter((d) => d.open).length, 0)

  return (
    <>
      <SectionSwitcher active="recite" />
      <HeroSection onKeyClick={() => setKeyOpen(true)} ready={ready} config={config} />

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <BookOpen className="size-8" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">لسه مفيش دروس منشورة</p>
            <p className="mt-1 text-sm text-muted-foreground">انتظر لحد ما الأدمن يضيف الدروس.</p>
          </div>
        </div>
      ) : !group ? (
        <>
          <StepGuide />
          <div className="mb-5 flex items-center justify-between gap-3" dir="rtl">
            <div>
              <h2 className="text-lg font-bold">اختار المادة</h2>
              <p className="text-sm text-muted-foreground">{groups.length} مادة · {openDecks} من {totalDecks} درس متاح</p>
            </div>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => {
              const openCount = g.decks.filter((d) => d.open).length
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setGroupId(g.id)}
                    className="group relative flex w-full flex-col rounded-2xl border bg-card p-5 text-start shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <FolderOpen className="size-6" aria-hidden />
                      </span>
                      <span className="mt-1 flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all group-hover:bg-primary/10 group-hover:text-primary">
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                    <h3 className="mt-4 text-base font-bold" dir="auto">{g.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{g.decks.length} درس</p>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{openCount} متاح</span>
                        <span>{g.decks.length - openCount} مقفول</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: g.decks.length ? `${(openCount / g.decks.length) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between gap-3" dir="rtl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setGroupId(null)}
                className="flex size-9 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
                aria-label="رجوع للمواد"
              >
                <ArrowRight className="size-5" aria-hidden />
              </button>
              <div>
                <p className="text-xs text-muted-foreground">التسميع بالكتابة</p>
                <h2 className="text-xl font-bold" dir="auto">{group.name}</h2>
              </div>
            </div>
            <span className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">
              {group.decks.filter((d) => d.open).length} / {group.decks.length} متاح
            </span>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.decks.map((d) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">{d.subject}</span>
                    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', d.open ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                      {d.open ? <PenLine className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold leading-snug" dir="auto">{d.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground line-clamp-2" dir="auto">{d.description}</p>
                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <span className={cn('flex items-center gap-1.5 text-xs font-medium', d.open ? 'text-primary' : 'text-muted-foreground')}>
                      {d.open ? (
                        <><Clock className="size-3.5" aria-hidden /> {d.cardCount} كارت</>
                      ) : (
                        <><Lock className="size-3.5" aria-hidden /> محتاج كود تفعيل</>
                      )}
                    </span>
                    {d.open && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                        ابدأ <ArrowLeft className="size-3" aria-hidden />
                      </span>
                    )}
                  </div>
                </>
              )
              const baseCls = 'flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              return (
                <li key={d.id}>
                  {d.open ? (
                    <Link href={`/recite/${d.id}`} className={cn(baseCls, 'hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10')}>
                      {body}
                    </Link>
                  ) : (
                    <Link href={`/decks/${d.id}`} className={cn(baseCls, 'opacity-60 hover:opacity-90')}>
                      {body}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <ApiKeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
    </>
  )
}
