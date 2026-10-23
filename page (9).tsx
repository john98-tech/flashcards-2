import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { SectionSwitcher } from '@/components/section-switcher'
import { RedeemForm } from '@/components/redeem-form'
import { GroupBrowser } from '@/components/group-browser'
import { getDeckGroups, getDeckSummaries } from '@/lib/decks'
import { canOpen, getAccess } from '@/lib/access'

export default async function HomePage() {
  const [decks, groups, access] = await Promise.all([getDeckSummaries(), getDeckGroups(), getAccess()])
  const hasPaid = decks.some((d) => !d.isFree)

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <SectionSwitcher active="cards" />
        <section className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-balance md:text-4xl">
              Memorize the textbook word for word, one blank at a time
            </h1>
            <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">
              Every card holds a sentence exactly as it appears in the book, with the key words blanked out.
              Reveal them or type them yourself, and mark what you know so you only review the rest.
            </p>
          </div>
          {hasPaid && <RedeemForm className="w-full rounded-xl border bg-card p-4 md:max-w-sm" />}
        </section>

        <GroupBrowser
          groups={groups.map((group) => ({
            ...group,
            decks: decks
              .filter((deck) => deck.groupId === group.id)
              .map((deck) => ({ ...deck, open: canOpen(deck, access) })),
          })).filter((group) => group.decks.length > 0)}
        />
      </main>
      <SiteFooter />
    </div>
  )
}
