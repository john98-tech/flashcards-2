import { notFound, redirect } from 'next/navigation'
import { RecallCourse } from '@/components/active-recall/recall-course'
import { getSession } from '@/lib/auth'
import { getStudentRecallCourse } from '@/lib/active-recall/data'

export const dynamic = 'force-dynamic'

export default async function ActiveRecallCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const session = await getSession()
  if (!session) redirect(`/login?next=${encodeURIComponent(`/active-recall/${courseId}`)}`)
  const course = await getStudentRecallCourse(courseId, session.id)
  if (!course) notFound()
  return <RecallCourse course={course} />
}
