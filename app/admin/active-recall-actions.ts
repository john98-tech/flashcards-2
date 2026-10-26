'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import * as recall from '@/lib/active-recall/data'
import type { RecallLesson, RecallQuestion } from '@/lib/active-recall/types'

const refresh = () => {
  revalidatePath('/admin')
  revalidatePath('/')
  revalidatePath('/active-recall', 'layout')
}

export async function adminCreateRecallCourse(name: string, startDate: string) {
  await requireAdmin()
  const course = await recall.createRecallCourse(name, startDate)
  refresh()
  return course
}

export async function adminUpdateRecallCourse(id: string, name: string, startDate: string) {
  await requireAdmin()
  const course = await recall.updateRecallCourse(id, name, startDate)
  refresh()
  return course
}

export async function adminDeleteRecallCourse(id: string) {
  await requireAdmin()
  await recall.deleteRecallCourse(id)
  refresh()
}

export async function adminSaveRecallLesson(input: {
  id?: string
  courseId: string
  title: string
  content: string
  question: RecallQuestion
}): Promise<RecallLesson> {
  await requireAdmin()
  const lesson = await recall.saveRecallLesson(input)
  refresh()
  return lesson
}

export async function adminDeleteRecallLesson(id: string) {
  await requireAdmin()
  await recall.deleteRecallLesson(id)
  refresh()
}
