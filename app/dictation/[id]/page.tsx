import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLessonFull, getSubject } from '@/lib/dictation/data'
import { NoteEditor } from '@/components/dictation/note-editor'

export const dynamic = 'force-dynamic'

async function load(id: string) {
  try {
    const full = await getLessonFull(id)
    if (!full) return null
    const subject = await getSubject(full.lesson.subjectId)
    return { full, subject }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: PageProps<'/dictation/[id]'>): Promise<Metadata> {
  const data = await load((await params).id)
  return { title: data ? `${data.full.lesson.title} | التسميع بالكتابة` : 'التسميع بالكتابة' }
}

export default async function DictationLessonPage({ params }: PageProps<'/dictation/[id]'>) {
  const { id } = await params
  const data = await load(id)
  if (!data) notFound()
  const { full, subject } = data

  // The page shows exactly what the admin wrote in the dictation editor for this lesson.
  const text = full.reference.kind === 'text' ? full.reference.text : ''

  return <NoteEditor lessonTitle={full.lesson.title} subjectName={subject?.name ?? ''} text={text} />
}
