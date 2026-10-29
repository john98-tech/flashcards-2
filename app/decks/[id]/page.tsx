import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { BackOneStep } from '@/components/back-one-step'
import { StudySession } from '@/components/study-session'
import { RedeemForm } from '@/components/redeem-form'
import { getDeck, getDeckMeta } from '@/lib/decks'
import { DemoDeckView } from '@/components/demo-deck-view'
import { canOpen, getAccess } from '@/lib/access'
import { DEMO_DECK_ID, demoDeck } from '@/lib/demo-data'
import { isAdmin } from '@/lib/admin-auth'

// Tutorial-only deck: not stored anywhere, only reachable while the tour runs.
function DemoDeckPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <nav aria-label="Page navigation" className="mb-6">
          <BackOneStep fallbackHref={`/?group=${encodeURIComponent(meta.groupId)}#flashcards`} />
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
  const [meta, access, admin] = await Promise.all([getDeckMeta(id), getAccess(), isAdmin()])
  if (!meta) notFound()
  const open = canOpen(meta, access)
  const deck = open ? await getDeck(id) : null

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <nav aria-label="Page navigation" className="mb-6">
          <BackOneStep fallbackHref={`/?group=${encodeURIComponent(meta.groupId)}#flashcards`} />
        </nav>
        <div className="mb-6">
          <span className="text-xs font-medium text-primary">{meta.subject}</span>
          <h1 className="text-2xl font-bold" dir="auto">
            {meta.title}
          </h1>
        </div>
        {deck && deck.cards.length > 0 ? (
          <StudySession deck={deck} isAdmin={admin} />
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
