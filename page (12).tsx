import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ReciteBrowser } from '@/components/recite/recite-browser'
import { getDeckGroups, getDeckSummaries } from '@/lib/decks'
import { canOpen, getAccess } from '@/lib/access'

export const metadata: Metadata = { title: 'Recite | تسميع' }

export default async function RecitePage() {
  const [decks, groups, access] = await Promise.all([getDeckSummaries(), getDeckGroups(), getAccess()])
  const data = groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      decks: decks
        .filter((d) => d.groupId === group.id && d.cardCount > 0)
        .map((d) => ({
          id: d.id,
          title: d.title,
          subject: d.subject,
          description: d.description,
          cardCount: d.cardCount,
          open: canOpen(d, access),
        })),
    }))
    .filter((group) => group.decks.length > 0)

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <ReciteBrowser groups={data} />
      </main>
      <SiteFooter />
    </div>
  )
}
