import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/supabase/admin'
import type {
  RecallCourse,
  RecallLesson,
  RecallQuestion,
  RecallSettings,
  StudentRecallPlan,
  StudentRecallLesson,
} from './types'

type CourseRow = { id: string; name: string; start_date: string; created_at: string }
type LessonRow = {
  id: string
  course_id: string
  title: string
  content: string
  position: number
  question_prompt: string
  question_type: 'open' | 'mcq'
  question_answer: string
  question_options: string[]
  correct_index: number
  question2_prompt: string | null
  question2_type: 'open' | 'mcq' | null
  question2_answer: string | null
  question2_options: string[] | null
  question2_correct_index: number | null
}

const COURSE_COLUMNS = 'id, name, start_date, created_at'
const LESSON_COLUMNS =
  'id, course_id, title, content, position, question_prompt, question_type, question_answer, question_options, correct_index, question2_prompt, question2_type, question2_answer, question2_options, question2_correct_index'

const toCourse = (row: CourseRow, lessonCount = 0): RecallCourse => ({
  id: row.id,
  name: row.name,
  startDate: row.start_date,
  createdAt: row.created_at,
  lessonCount,
})

const toLesson = (row: LessonRow): RecallLesson => ({
  id: row.id,
  courseId: row.course_id,
  title: row.title,
  content: row.content,
  position: row.position,
  question: {
    prompt: row.question_prompt,
    type: row.question_type,
    answer: row.question_answer,
    options: row.question_options ?? [],
    correctIndex: row.correct_index,
  },
  additionalQuestion: row.question2_prompt && row.question2_type
    ? {
        prompt: row.question2_prompt,
        type: row.question2_type,
        answer: row.question2_answer ?? '',
        options: row.question2_options ?? [],
        correctIndex: row.question2_correct_index ?? 0,
      }
    : null,
})

function fail(error: { message: string }): never {
  throw new Error(error.message)
}

function cleanText(value: string, label: string, max: number) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`)
  const text = value.trim()
  if (!text || text.length > max) throw new Error(`${label} must be between 1 and ${max} characters.`)
  return text
}

function cleanDate(value: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Choose a valid course start date.')
  }
  return value
}

function cleanQuestion(question: RecallQuestion) {
  if (!question || typeof question !== 'object') throw new Error('Enter a valid question.')
  if (question.type !== 'open' && question.type !== 'mcq') throw new Error('Choose a valid question type.')
  const prompt = cleanText(question.prompt, 'Question', 2000)
  if (question.type === 'open') {
    return { prompt, type: 'open' as const, answer: cleanText(question.answer, 'Model answer', 10000), options: [], correctIndex: 0 }
  }
  if (!Array.isArray(question.options)) throw new Error('Enter the answer choices.')
  const options = question.options.map((option) => cleanText(option, 'Each choice', 500))
  if (options.length < 2 || options.length > 6) throw new Error('A multiple-choice question needs 2 to 6 choices.')
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= options.length) {
    throw new Error('Choose a valid correct answer.')
  }
  return { prompt, type: 'mcq' as const, answer: '', options, correctIndex: question.correctIndex }
}

function cleanOptionalQuestion(question: RecallQuestion | null | undefined) {
  if (question == null) return null
  return cleanQuestion(question)
}

export async function listRecallCourses(): Promise<RecallCourse[]> {
  const [courses, lessons] = await Promise.all([
    db().from('active_recall_courses').select(COURSE_COLUMNS).order('created_at'),
    db().from('active_recall_lessons').select('course_id'),
  ])
  if (courses.error) fail(courses.error)
  if (lessons.error) fail(lessons.error)
  const counts = new Map<string, number>()
  for (const lesson of lessons.data ?? []) counts.set(lesson.course_id, (counts.get(lesson.course_id) ?? 0) + 1)
  return (courses.data as CourseRow[]).map((row) => toCourse(row, counts.get(row.id) ?? 0))
}

export async function listRecallLessons(): Promise<RecallLesson[]> {
  const { data, error } = await db()
    .from('active_recall_lessons')
    .select(LESSON_COLUMNS)
    .order('course_id')
    .order('position')
  if (error) fail(error)
  return (data as LessonRow[]).map(toLesson)
}

export async function createRecallCourse(name: string, startDate: string): Promise<RecallCourse> {
  const row = {
    id: randomUUID(),
    name: cleanText(name, 'Course name', 120),
    start_date: cleanDate(startDate),
  }
  const { data, error } = await db().from('active_recall_courses').insert(row).select(COURSE_COLUMNS).single()
  if (error) fail(error)
  return toCourse(data as CourseRow)
}

export async function updateRecallCourse(id: string, name: string, startDate: string): Promise<RecallCourse> {
  const { data, error } = await db()
    .from('active_recall_courses')
    .update({ name: cleanText(name, 'Course name', 120), start_date: cleanDate(startDate), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COURSE_COLUMNS)
    .maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('Course not found.')
  return toCourse(data as CourseRow)
}

export async function deleteRecallCourse(id: string): Promise<void> {
  const { error } = await db().from('active_recall_courses').delete().eq('id', id)
  if (error) fail(error)
}

export async function saveRecallLesson(
  input: Omit<RecallLesson, 'id' | 'position' | 'additionalQuestion'> & {
    id?: string
    additionalQuestion?: RecallQuestion | null
  },
): Promise<RecallLesson> {
  const title = cleanText(input.title, 'Lesson title', 200)
  const content = cleanText(input.content, 'Lesson content', 20000)
  const question = cleanQuestion(input.question)
  const additionalQuestion = cleanOptionalQuestion(input.additionalQuestion)
  const values = {
    course_id: input.courseId,
    title,
    content,
    question_prompt: question.prompt,
    question_type: question.type,
    question_answer: question.answer,
    question_options: question.options,
    correct_index: question.correctIndex,
    question2_prompt: additionalQuestion?.prompt ?? null,
    question2_type: additionalQuestion?.type ?? null,
    question2_answer: additionalQuestion?.answer ?? null,
    question2_options: additionalQuestion?.options ?? null,
    question2_correct_index: additionalQuestion?.correctIndex ?? null,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await db()
      .from('active_recall_lessons')
      .update(values)
      .eq('id', input.id)
      .select(LESSON_COLUMNS)
      .maybeSingle()
    if (error) fail(error)
    if (!data) throw new Error('Lesson not found.')
    return toLesson(data as LessonRow)
  }

  const { data: last, error: lastError } = await db()
    .from('active_recall_lessons')
    .select('position')
    .eq('course_id', input.courseId)
    .order('position', { ascending: false })
    .limit(1)
  if (lastError) fail(lastError)
  const { data, error } = await db()
    .from('active_recall_lessons')
    .insert({ id: randomUUID(), ...values, position: (last?.[0]?.position ?? 0) + 1 })
    .select(LESSON_COLUMNS)
    .single()
  if (error) fail(error)
  return toLesson(data as LessonRow)
}

export async function deleteRecallLesson(id: string): Promise<void> {
  const { error } = await db().from('active_recall_lessons').delete().eq('id', id)
  if (error) fail(error)
}

export function cairoDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export async function getRecallSettings(): Promise<RecallSettings> {
  const { data, error } = await db()
    .from('active_recall_settings')
    .select('intervals, daily_goal, rest_day')
    .eq('id', true)
    .single()
  if (error) fail(error)
  return { intervals: data.intervals as number[], dailyGoal: data.daily_goal as number, restDay: data.rest_day as number | null }
}

export async function updateRecallSettings(settings: RecallSettings): Promise<RecallSettings> {
  if (
    settings.intervals.length < 1 ||
    settings.intervals.length > 12 ||
    settings.intervals.some((value, index) =>
      !Number.isInteger(value) || value < 0 || (index > 0 && value <= settings.intervals[index - 1]),
    )
  ) {
    throw new Error('يجب إدخال فواصل زمنية صحيحة ومتزايدة.')
  }
  if (!Number.isInteger(settings.dailyGoal) || settings.dailyGoal < 1 || settings.dailyGoal > 100) {
    throw new Error('هدف الجلسات اليومية يجب أن يكون بين 1 و100.')
  }
  if (settings.restDay !== null && (!Number.isInteger(settings.restDay) || settings.restDay < 0 || settings.restDay > 6)) {
    throw new Error('اختر يوم راحة صحيحًا.')
  }
  const { data, error } = await db()
    .from('active_recall_settings')
    .upsert({ id: true, intervals: settings.intervals, daily_goal: settings.dailyGoal, rest_day: settings.restDay, updated_at: new Date().toISOString() })
    .select('intervals, daily_goal, rest_day')
    .single()
  if (error) fail(error)
  return { intervals: data.intervals as number[], dailyGoal: data.daily_goal as number, restDay: data.rest_day as number | null }
}

export type RecallCatalog = {
  courses: RecallCourse[]
  lessons: Array<{ id: string; courseId: string; title: string; position: number }>
}

export async function getRecallCatalog(): Promise<RecallCatalog> {
  const [courses, lessons] = await Promise.all([
    listRecallCourses(),
    db().from('active_recall_lessons').select('id, course_id, title, position').order('course_id').order('position'),
  ])
  if (lessons.error) fail(lessons.error)
  return {
    courses,
    lessons: (lessons.data ?? []).map((row) => ({
      id: row.id as string,
      courseId: row.course_id as string,
      title: row.title as string,
      position: row.position as number,
    })),
  }
}

type PlanRow = {
  id: string
  course_id: string
  start_date: string
  end_date: string
  exam_date: string | null
  lesson_ids: string[]
  intervals: number[]
  daily_goal: number
  rest_day: number | null
}

type SessionRow = {
  id: string
  lesson_id: string
  review_number: number
  scheduled_date: string
  status: 'pending' | 'completed' | 'rescheduled' | 'skipped'
  completed_at: string | null
  self_assessment: 'knew_it' | 'review_again' | null
}

export async function getStudentRecallCourse(id: string, userId: string): Promise<{
  id: string
  name: string
  lessons: StudentRecallLesson[]
  plan: StudentRecallPlan | null
} | null> {
  const { data: courseData, error: courseError } = await db()
    .from('active_recall_courses')
    .select(COURSE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (courseError) fail(courseError)
  if (!courseData) return null

  const { data: lessonData, error: lessonError } = await db()
    .from('active_recall_lessons')
    .select(LESSON_COLUMNS)
    .eq('course_id', id)
    .order('position')
  if (lessonError) fail(lessonError)

  const course = courseData as CourseRow
  const rows = lessonData as LessonRow[]
  const { data: planData, error: planError } = await db()
    .from('active_recall_plans')
    .select('id, course_id, start_date, end_date, exam_date, lesson_ids, intervals, daily_goal, rest_day')
    .eq('user_id', userId)
    .eq('course_id', id)
    .eq('status', 'active')
    .maybeSingle()
  if (planError) fail(planError)

  const planRow = planData as PlanRow | null
  const lessonById = new Map<string, RecallLesson>()
  const lessons = rows.map((row) => {
    const lesson = toLesson(row)
    lessonById.set(lesson.id, lesson)
    return {
      id: lesson.id,
      title: lesson.title,
      position: lesson.position,
      content: lesson.content,
      question: lesson.question,
      additionalQuestion: lesson.additionalQuestion,
    }
  })

  if (!planRow) return { id: course.id, name: course.name, lessons, plan: null }

  const { data: sessionData, error: sessionError } = await db()
    .from('active_recall_sessions')
    .select('id, lesson_id, review_number, scheduled_date, status, completed_at, self_assessment')
    .eq('plan_id', planRow.id)
    .eq('user_id', userId)
    .order('scheduled_date')
    .order('review_number')
  if (sessionError) fail(sessionError)
  const sessions = (sessionData as SessionRow[]).flatMap((session) => {
    const lesson = lessonById.get(session.lesson_id)
    if (!lesson) return []
    return [{
      id: session.id,
      lessonId: session.lesson_id,
      lessonTitle: lesson.title,
      reviewNumber: session.review_number,
      scheduledDate: session.scheduled_date,
      status: session.status,
      completedAt: session.completed_at,
      selfAssessment: session.self_assessment,
    }]
  })
  const plan: StudentRecallPlan = {
    id: planRow.id,
    courseId: planRow.course_id,
    startDate: planRow.start_date,
    endDate: planRow.end_date,
    examDate: planRow.exam_date,
    lessonIds: planRow.lesson_ids,
    intervals: planRow.intervals,
    dailyGoal: planRow.daily_goal,
    restDay: planRow.rest_day,
    sessions,
  }
  return { id: course.id, name: course.name, lessons, plan }
}

export async function saveStudentRecallPlan({
  userId,
  courseId,
  startDate,
  endDate,
  examDate,
  lessonIds,
  intervals,
  dailyGoal,
  restDay,
  sessions,
}: {
  userId: string
  courseId: string
  startDate: string
  endDate: string
  examDate: string | null
  lessonIds: string[]
  intervals: number[]
  dailyGoal: number
  restDay: number | null
  sessions: Array<{ lessonId: string; reviewNumber: number; scheduledDate: string }>
}): Promise<string> {
  const { data, error } = await db().rpc('save_active_recall_plan', {
    p_user_id: userId,
    p_course_id: courseId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_exam_date: examDate,
    p_lesson_ids: lessonIds,
    p_intervals: intervals,
    p_daily_goal: dailyGoal,
    p_rest_day: restDay,
    p_sessions: sessions.map((session) => ({
      lesson_id: session.lessonId,
      review_number: session.reviewNumber,
      scheduled_date: session.scheduledDate,
    })),
  })
  if (error) fail(error)
  return data as string
}

export async function completeRecallSession(
  userId: string,
  sessionId: string,
  selfAssessment: 'knew_it' | 'review_again' | null,
  today: string = cairoDate(),
): Promise<void> {
  const { data, error } = await db()
    .from('active_recall_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      self_assessment: selfAssessment,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .in('status', ['pending', 'rescheduled'])
    .lte('scheduled_date', today)
    .select('id')
    .maybeSingle()
  if (error) fail(error)
  if (data) return
  const { data: existing, error: existingError } = await db()
    .from('active_recall_sessions')
    .select('status')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existingError) fail(existingError)
  if (existing?.status === 'completed') return
  throw new Error('جلسة المراجعة غير موجودة أو لم تعد متاحة.')
}
