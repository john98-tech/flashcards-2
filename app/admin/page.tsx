import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { AdminTabs } from '@/components/admin/admin-tabs'
import type { DictationAdminData } from '@/components/admin/dictation-admin'
import { isAdmin } from '@/lib/admin-auth'
import { getDeckGroups, getDeckSummaries } from '@/lib/decks'
import { listLessons, listSubjects } from '@/lib/dictation/data'

export const metadata: Metadata = {
  title: 'Admin panel | Sammaa',
  robots: { index: false, follow: false },
}

// Dictation data is read separately so a missing migration can never break the flashcards admin.
async function loadDictation(): Promise<DictationAdminData> {
  try {
    const [subjects, lessons] = await Promise.all([listSubjects(), listLessons()])
    return { subjects, lessons, loadError: null }
  } catch (error) {
    return { subjects: [], lessons: [], loadError: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export default async function AdminPage() {
  if (!(await isAdmin())) notFound()
  const [decks, groups, dictation] = await Promise.all([getDeckSummaries(), getDeckGroups(), loadDictation()])

  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <span className="text-sm text-muted-foreground">Admin panel</span>
      </SiteHeader>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <AdminTabs decks={decks} groups={groups} dictation={dictation} />
      </main>
    </div>
  )
}
