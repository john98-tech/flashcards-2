import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { StudySession } from '@/components/study-session'
import { RedeemForm } from '@/components/redeem-form'
import { getDeck, getDeckMeta } from '@/lib/decks'
import { DemoDeckView } from '@/components/demo-deck-view'
import { canOpen, getAccess } from '@/lib/access'
import { DEMO_DECK_ID, demoDeck } from '@/lib/demo-data'

// Tutorial-only deck: not stored anywhere, only reachable while the tour runs.
function DemoDeckPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <nav aria-label="Page navigation" className="mb-6">
          <Link href="/" data-tour="home-link" data-tour-action="return-home" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4" aria-hidden />
            الرئيسية
          </Link>
        </nav>
        <div className="mb-6">
          <span className="text-xs font-medium text-primary">{demoDeck.subject}</span>
          <h1 className="text-2xl font-bold" dir="auto">
            {demoDeck.title}
          </h1>
        </div>
        <DemoDeckView />
      </main>
    </div>
  )
}

export async function generateMetadata({ params }: PageProps<'/decks/[id]'>): Promise<Metadata> {
  const deck = await getDeckMeta((await params).id)
  return { title: deck ? `${deck.title} | Sammaa` : 'Sammaa' }
}

export default async function DeckPage({ params }: PageProps<'/decks/[id]'>) {
  const { id } = await params
  if (id === DEMO_DECK_ID) return <DemoDeckPage />
  const [meta, access] = await Promise.all([getDeckMeta(id), getAccess()])
  if (!meta) notFound()
  const open = canOpen(meta, access)
  const deck = open ? await getDeck(id) : null

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <nav aria-label="Page navigation" className="mb-6">
          <Link href="/" data-tour="home-link" data-tour-action="return-home" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-4" aria-hidden />
            الرئيسية
          </Link>
        </nav>
        <div className="mb-6">
          <span className="text-xs font-medium text-primary">{meta.subject}</span>
          <h1 className="text-2xl font-bold" dir="auto">
            {meta.title}
          </h1>
        </div>
        {deck && deck.cards.length > 0 ? (
          <StudySession deck={deck} />
        ) : deck ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            This deck has no cards yet.
          </p>
        ) : (
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
            <RedeemForm className="w-full max-w-sm text-left" />
          </div>
        )}
      </main>
    </div>
  )
}
