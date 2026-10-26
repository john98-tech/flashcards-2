'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { completeRecallLesson, getStudentRecallCourse } from '@/lib/active-recall/data'

export async function markRecallLessonComplete(courseId: string, lessonId: string) {
  const session = await getSession()
  if (!session) throw new Error('سجّل الدخول أولًا لحفظ تقدمك.')
  const course = await getStudentRecallCourse(courseId, session.id)
  const lesson = course?.lessons.find((item) => item.id === lessonId)
  if (!lesson?.available) throw new Error('هذا الدرس لم يفتح بعد.')
  await completeRecallLesson(session.id, lessonId)
  revalidatePath(`/active-recall/${courseId}`)
}
