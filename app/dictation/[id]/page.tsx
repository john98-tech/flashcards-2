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

  return (
    <NoteEditor
      lessonId={id}
      lessonTitle={full.lesson.title}
      subjectName={subject?.name ?? ''}
      referenceText={full.reference.kind === 'text' ? full.reference.text : ''}
      gradingPrompt={full.reference.prompt}
      studentText={full.studentMaterial.text}
      studentImages={full.studentMaterial.images}
      guideHeadings={full.headings.map((heading) => ({ id: heading.id, level: heading.level, title: heading.title, order: heading.order }))}
    />
  )
}
