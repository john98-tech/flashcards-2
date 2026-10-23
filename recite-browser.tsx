'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, FolderOpen, KeyRound, Lock, PenLine, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGeminiConfig } from '@/lib/gemini'
import { SectionSwitcher } from '@/components/section-switcher'
import { ApiKeyDialog } from '@/components/recite/api-key-dialog'

export type ReciteDeck = { id: string; title: string; subject: string; description: string; cardCount: number; open: boolean }
export type ReciteGroup = { id: string; name: string; decks: ReciteDeck[] }

export function ReciteBrowser({ groups }: { groups: ReciteGroup[] }) {
  const [groupId, setGroupId] = useState<string | null>(null)
  const [keyOpen, setKeyOpen] = useState(false)
  const { config, ready } = useGeminiConfig()
  const group = groups.find((g) => g.id === groupId)

  return (
    <>
      <SectionSwitcher active="recite" />
      <section className="mb-8 flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between" dir="rtl">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold">التسميع بالكتابة</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              اختار درس، اكتب كل اللي فاكره على صفحة بيضا (كيبورد أو قلم)، وGemini هيصحح لك الغلط والإملاء والنواقص.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setKeyOpen(true)}
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
            ready && config ? 'border-success/40 bg-success/10 text-success' : 'bg-primary text-primary-foreground',
          )}
        >
          <KeyRound className="size-4" aria-hidden />
          {ready && config ? 'مفتاح Gemini جاهز' : 'ضيف مفتاح Gemini'}
        </button>
      </section>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">لسه مفيش دروس منشورة.</p>
      ) : !group ? (
        <>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground" dir="rtl">اختار المادة</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setGroupId(g.id)}
                  className="group flex w-full items-center gap-4 rounded-xl border bg-card p-5 text-start transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <FolderOpen className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" dir="auto">{g.name}</span>
                    <span className="text-sm text-muted-foreground">{g.decks.length} درس</span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="truncate text-xl font-bold" dir="auto">{group.name}</h2>
            <button type="button" onClick={() => setGroupId(null)} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden /> كل المواد
            </button>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.decks.map((d) => {
              const body = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{d.subject}</span>
                    {d.open ? <PenLine className="size-4 text-primary" aria-hidden /> : <Lock className="size-4 text-muted-foreground" aria-hidden />}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold" dir="auto">{d.title}</h3>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground" dir="auto">{d.description}</p>
                  <p className="mt-4 text-sm text-muted-foreground">{d.open ? `${d.cardCount} كارت · ابدأ التسميع` : 'محتاج كود تفعيل'}</p>
                </>
              )
              const cls = 'flex h-full flex-col rounded-xl border bg-card p-5 transition-all'
              return (
                <li key={d.id}>
                  {d.open ? (
                    <Link href={`/recite/${d.id}`} className={cn(cls, 'hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
                      {body}
                    </Link>
                  ) : (
                    <Link href={`/decks/${d.id}`} className={cn(cls, 'opacity-70 hover:opacity-100')}>
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
