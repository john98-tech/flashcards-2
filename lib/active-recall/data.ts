import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/supabase/admin'
import type { RecallCourse, RecallLesson, RecallQuestion, StudentRecallCourse } from './types'

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
}

const COURSE_COLUMNS = 'id, name, start_date, created_at'
const LESSON_COLUMNS =
  'id, course_id, title, content, position, question_prompt, question_type, question_answer, question_options, correct_index'

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
  input: Omit<RecallLesson, 'id' | 'position'> & { id?: string },
): Promise<RecallLesson> {
  const title = cleanText(input.title, 'Lesson title', 200)
  const content = cleanText(input.content, 'Lesson content', 20000)
  const question = cleanQuestion(input.question)
  const values = {
    course_id: input.courseId,
    title,
    content,
    question_prompt: question.prompt,
    question_type: question.type,
    question_answer: question.answer,
    question_options: question.options,
    correct_index: question.correctIndex,
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

function cairoDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export async function getStudentRecallCourse(id: string, userId: string): Promise<StudentRecallCourse | null> {
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
  const { data: progressData, error: progressError } = rows.length
    ? await db()
      .from('active_recall_progress')
      .select('lesson_id')
      .eq('user_id', userId)
      .in('lesson_id', rows.map((row) => row.id))
    : { data: [], error: null }
  if (progressError) fail(progressError)
  const completedLessonIds = (progressData ?? []).map((row) => row.lesson_id as string)
  const start = Date.parse(`${course.start_date}T00:00:00Z`)
  const today = Date.parse(`${cairoDate()}T00:00:00Z`)
  const currentDay = Math.floor((today - start) / 86_400_000) + 1
  const lessons = rows.map((row, index) => {
    const day = index + 1
    const available = day <= currentDay
    const lesson = toLesson(row)
    return {
      id: lesson.id,
      title: lesson.title,
      day,
      available,
      ...(available ? { content: lesson.content, question: lesson.question } : {}),
    }
  })

  return { id: course.id, name: course.name, startDate: course.start_date, currentDay, completedLessonIds, lessons }
}

export async function completeRecallLesson(userId: string, lessonId: string): Promise<void> {
  const { error } = await db().from('active_recall_progress').upsert(
    { user_id: userId, lesson_id: lessonId, completed_at: new Date().toISOString() },
    { onConflict: 'user_id,lesson_id' },
  )
  if (error) fail(error)
}
