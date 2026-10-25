import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { HomeHub } from '@/components/home-hub'
import { getDeckGroups, getDeckSummaries } from '@/lib/decks'
import { canOpen, getAccess } from '@/lib/access'
import { listLessons, listSubjects } from '@/lib/dictation/data'

// Written dictation is read separately so a missing migration can never break the flashcards home.
async function loadDictation() {
  try {
    const [subjects, lessons] = await Promise.all([listSubjects(), listLessons()])
    return subjects
      .map((subject) => ({
        id: subject.id,
        name: subject.name,
        lessons: lessons
          .filter((lesson) => lesson.subjectId === subject.id)
          .map((lesson) => ({ id: lesson.id, title: lesson.title, description: lesson.description })),
      }))
      .filter((subject) => subject.lessons.length > 0)
  } catch {
    return []
  }
}

export default async function HomePage() {
  const [decks, groups, access, dictation] = await Promise.all([getDeckSummaries(), getDeckGroups(), getAccess(), loadDictation()])
  const hasPaid = decks.some((d) => !d.isFree)

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <HomeHub
          hasPaid={hasPaid}
          dictation={dictation}
          groups={groups
            .map((group) => ({
              ...group,
              decks: decks
                .filter((deck) => deck.groupId === group.id)
                .map((deck) => ({ ...deck, open: canOpen(deck, access) })),
            }))
            .filter((group) => group.decks.length > 0)}
        />
      </main>
      <SiteFooter />
    </div>
  )
}
