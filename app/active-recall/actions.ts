'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { cairoDate, completeRecallSession, getRecallSettings, saveStudentRecallPlan } from '@/lib/active-recall/data'
import { buildRecallSchedule } from '@/lib/active-recall/scheduler'
import { db } from '@/lib/supabase/admin'

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// "Today" for the app: the trial date (testDate) when one is selected, otherwise the real Cairo date.
function effectiveToday(testDate?: string | null) {
  return testDate && isValidDate(testDate) ? testDate : cairoDate()
}

export async function saveRecallPlan(input: {
  courseId: string
  lessonIds: string[]
  durationDays: number
  examDate: string | null
  testDate?: string | null
}) {
  const session = await getSession()
  if (!session) throw new Error('سجّل الدخول أولًا لإنشاء خطة مراجعة.')
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 366) {
    throw new Error('مدة المراجعة يجب أن تكون بين يوم واحد وسنة.')
  }
  const scheduleStartDate = effectiveToday(input.testDate)
  if (input.examDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.examDate) || input.examDate < scheduleStartDate)) {
    throw new Error('يجب أن يكون موعد الامتحان اليوم أو بعده.')
  }
  const { data: existingPlan, error: existingPlanError } = await db()
    .from('active_recall_plans')
    .select('start_date')
    .eq('user_id', session.id)
    .eq('course_id', input.courseId)
    .eq('status', 'active')
    .maybeSingle()
  if (existingPlanError) throw new Error(existingPlanError.message)
  const planStartDate = existingPlan?.start_date ?? scheduleStartDate
  const requestedEnd = addDays(scheduleStartDate, input.durationDays - 1)
  const endDate = input.examDate && input.examDate < requestedEnd ? input.examDate : requestedEnd
  const settings = await getRecallSettings()
  const schedule = buildRecallSchedule({
    lessonIds: input.lessonIds,
    startDate: scheduleStartDate,
    endDate,
    intervals: settings.intervals,
    dailyGoal: settings.dailyGoal,
    restDay: settings.restDay,
  })
  const { data: lessons, error } = await db()
    .from('active_recall_lessons')
    .select('id')
    .eq('course_id', input.courseId)
    .in('id', input.lessonIds)
  if (error) throw new Error(error.message)
  if (lessons?.length !== new Set(input.lessonIds).size) {
    throw new Error('تحتوي الاختيارات على درس غير تابع لهذا المنهج.')
  }
  const id = await saveStudentRecallPlan({
    userId: session.id,
    courseId: input.courseId,
    startDate: planStartDate,
    endDate,
    examDate: input.examDate,
    lessonIds: input.lessonIds,
    intervals: settings.intervals,
    dailyGoal: settings.dailyGoal,
    restDay: settings.restDay,
    sessions: schedule.sessions,
  })
  revalidatePath('/active-recall')
  revalidatePath(`/active-recall/${input.courseId}`)
  return { id, startDate: planStartDate, endDate, sessions: schedule.sessions, dailyCounts: schedule.dailyCounts, overloadedDays: schedule.overloadedDays }
}

export async function markRecallSessionComplete(
  courseId: string,
  sessionId: string,
  selfAssessment: 'knew_it' | 'review_again' | null,
  testDate?: string | null,
) {
  const session = await getSession()
  if (!session) throw new Error('سجّل الدخول أولًا لحفظ تقدمك.')
  await completeRecallSession(session.id, sessionId, selfAssessment, effectiveToday(testDate))
  revalidatePath(`/active-recall/${courseId}`)
  revalidatePath('/active-recall')
}
