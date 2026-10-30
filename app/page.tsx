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
                .map((deck) => ({ ...deck, open: canOpen(deck, access) }))
                .sort((a, b) => {
                  // Follow the textbook's subject sequence first, then each subject's part sequence.
                  const subjectOrder = (title: string) => {
                    const normalized = title.toLowerCase()
                    if (normalized.startsWith('cho chemistry')) return 0
                    if (normalized.startsWith('lipid chemistry')) return 1
                    if (normalized.startsWith('protein chemistry')) return 2
                    if (normalized.startsWith('enzyme chemistry')) return 3
                    if (normalized.startsWith('molecular biology')) return 4
                    if (normalized.startsWith('cell signaling')) return 5
                    return Number.MAX_SAFE_INTEGER
                  }
                  const subjectA = subjectOrder(a.title)
                  const subjectB = subjectOrder(b.title)
                  if (subjectA !== subjectB) return subjectA - subjectB

                  const partOrder = (title: string) => {
                    const match = title.match(/\\bPart\\s+(\\d+)\\s*([A-Z])?\\b/i)
                    if (!match) return { number: Number.MAX_SAFE_INTEGER, suffix: '' }
                    return { number: Number(match[1]), suffix: (match[2] ?? '').toUpperCase() }
                  }
                  const partA = partOrder(a.title)
                  const partB = partOrder(b.title)
                  if (partA.number !== partB.number) return partA.number - partB.number
                  const suffixOrder = (suffix: string) => suffix ? suffix.charCodeAt(0) - 64 : 0
                  return suffixOrder(partA.suffix) - suffixOrder(partB.suffix)
                }),
            }))
            .filter((group) => group.decks.length > 0)}
        />
      </main>
      <SiteFooter />
    </div>
  )
}
