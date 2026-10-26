import { notFound, redirect } from 'next/navigation'
import { RecallCourse } from '@/components/active-recall/recall-course'
import { getSession } from '@/lib/auth'
import { getStudentRecallCourse } from '@/lib/active-recall/data'

export const dynamic = 'force-dynamic'

export default async function ActiveRecallCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const session = await getSession()
  if (!session) redirect(`/login?next=${encodeURIComponent(`/active-recall/${courseId}`)}`)
  let course: Awaited<ReturnType<typeof getStudentRecallCourse>> = null
  try {
    course = await getStudentRecallCourse(courseId, session.id)
  } catch (error) {
    console.error('[active-recall] failed to load course:', error)
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-16 text-center" dir="rtl">
        <p className="rounded-xl border border-dashed p-10 text-sm text-muted-foreground">تعذّر تحميل الدورة حاليًا. حاول مرة أخرى بعد قليل.</p>
      </main>
    )
  }
  if (!course) notFound()
  const startDateLabel = new Date(`${course.startDate}T00:00:00Z`).toLocaleDateString('ar-EG', {
    timeZone: 'UTC',
  })
  return <RecallCourse course={course} startDateLabel={startDateLabel} />
}
