'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, FolderOpen, Layers, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { demoDeckSummary, demoGroup } from '@/lib/demo-data'
import { useDemoState } from '@/lib/demo-tour'

type BrowserDeck = DeckSummary & { open: boolean }
type BrowserGroup = DeckGroup & { decks: BrowserDeck[] }

export function GroupBrowser({ groups: realGroups }: { groups: BrowserGroup[] }) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [deckProgress, setDeckProgress] = useState<Record<string, { completed: number; percent: number }>>({})

  const refreshProgress = useCallback(() => {
    try {
      const next: Record<string, { completed: number; percent: number }> = {}
      for (const group of realGroups) {
        for (const deck of group.decks) {
          const raw = localStorage.getItem(`sammaa-progress-${deck.id}`)
          const saved: unknown = raw ? JSON.parse(raw) : []
          const known = Array.isArray(saved) ? new Set(saved.filter((id): id is string => typeof id === 'string')) : new Set<string>()
          const completed = Math.min(known.size, deck.cardCount)
          next[deck.id] = { completed, percent: deck.cardCount > 0 ? Math.round((completed / deck.cardCount) * 100) : 0 }
        }
      }
      setDeckProgress(next)
    } catch {
      // Progress indicators should never prevent the deck browser from rendering.
    }
  }, [realGroups])

  useEffect(() => {
    refreshProgress()
    const onStorage = () => refreshProgress()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshProgress()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshProgress])
  const demo = useDemoState()
  // While the guided tour runs, only the tutorial's demo group is listed.
  const groups: BrowserGroup[] = demo.active
    ? [{ ...demoGroup, decks: [{ ...demoDeckSummary, open: demo.unlocked }] }]
    : realGroups
  const selectedGroup = groups.find((group) => group.id === selectedGroupId)

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        No decks published yet.
      </p>
    )
  }

  if (selectedGroup) {
    return (
      <section key={selectedGroup.id} className="group-view-enter">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <FolderOpen className="size-5" aria-hidden />
            </span>
            <h2 className="truncate text-xl font-bold sm:text-2xl" dir="auto">{selectedGroup.name}</h2>
          </div>
          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All groups
          </button>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {selectedGroup.decks.map((deck, index) => (
            <li key={deck.id} className="group-card-enter" style={{ animationDelay: `${Math.min(index * 65, 390)}ms` }}>
              <Link
                href={`/decks/${deck.id}`}
                data-tour="deck-card"
                data-tour-action="open-deck"
                className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="absolute inset-x-0 top-0 h-1.5 bg-muted" aria-hidden>
                  <div
                    className="h-full rounded-r-full bg-gradient-to-r from-sky-500 via-violet-500 to-emerald-400 transition-[width] duration-700 ease-out"
                    style={{ width: `${deckProgress[deck.id]?.percent ?? 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="w-fit rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                    {deck.subject}
                  </span>
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-xs font-medium',
                      deck.isFree ? 'bg-success/15 text-success' : 'bg-highlight text-highlight-foreground',
                    )}
                  >
                    {deck.isFree ? 'Free' : deck.open ? 'Unlocked' : 'Paid'}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold" dir="auto">{deck.title}</h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground" dir="auto">
                  {deck.description}
                </p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span dir="ltr" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground">
                    <Layers className="size-4 shrink-0" aria-hidden />
                    <span>{deck.cardCount} cards · {deck.blankCount} blanks</span>
                  </span>
                  {deck.open ? (
                    <span className="flex items-center gap-1 font-medium text-primary">
                      Start
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-medium text-muted-foreground">
                      <Lock className="size-4" aria-hidden /> Locked
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group, index) => {
        const cardCount = group.decks.reduce((sum, deck) => sum + deck.cardCount, 0)
        return (
          <li key={group.id} className="group-card-enter" style={{ animationDelay: `${Math.min(index * 90, 450)}ms` }}>
            <button
              type="button"
              onClick={() => setSelectedGroupId(group.id)}
              data-tour="group-card"
              data-tour-action="open-group"
              aria-label={`Open ${group.name}, ${group.decks.length} ${group.decks.length === 1 ? 'deck' : 'decks'}`}
              className="group relative flex h-full min-h-48 w-full flex-col overflow-hidden rounded-xl border bg-card p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="group-card-shine pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative flex w-full items-start justify-between gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-accent text-primary shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground">
                  <FolderOpen className="size-5" aria-hidden />
                </span>
                <span className="rounded-md border bg-background/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {group.decks.length} {group.decks.length === 1 ? 'deck' : 'decks'}
                </span>
              </div>
              <div className="relative mt-5 flex-1">
                <p className="text-xs font-semibold text-primary">Study collection</p>
                <h2 className="mt-1 text-xl font-bold leading-snug" dir="auto">{group.name}</h2>
              </div>
              <div className="relative mt-4 flex w-full items-center justify-between border-t border-border/70 pt-3 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Layers className="size-4" aria-hidden />
                  {cardCount} cards
                </span>
                <span className="flex items-center gap-1 font-medium text-primary">
                  Browse group
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                </span>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}