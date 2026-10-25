'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import * as dictation from '@/lib/dictation/data'
import type {
  DictationHeading,
  DictationLesson,
  DictationLessonFull,
  DictationReference,
  DictationSubject,
  DictationSubjectSummary,
  HeadingInput,
} from '@/lib/dictation/types'

/**
 * Admin server actions for written dictation. Every action checks the admin session first,
 * then delegates to lib/dictation/data.ts. Separate from app/admin/actions.ts (flashcards).
 */

const refresh = () => {
  revalidatePath('/admin')
  revalidatePath('/')
  revalidatePath('/dictation', 'layout')
}

type AdminActionResult<T> = { ok: true; value: T } | { ok: false; error: string }

async function runAdminAction<T>(action: () => Promise<T>): Promise<AdminActionResult<T>> {
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/unregistered api key/i.test(message)) {
      return {
        ok: false,
        error: 'Supabase رفض مفتاح الخدمة. راجع SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY في إعدادات الاستضافة وتأكد أنهما من نفس مشروع Supabase، ثم أعد النشر.',
      }
    }
    if (/prompt_text/i.test(message)) {
      return {
        ok: false,
        error: 'قاعدة البيانات تحتاج تحديثًا. شغّل migration 20261025000100_dictation_grading_prompt.sql في Supabase ثم أعد المحاولة.',
      }
    }
    return { ok: false, error: message || 'تعذر الحفظ في قاعدة البيانات. حاول مرة أخرى.' }
  }
}

// Subjects
export async function adminListDictationSubjects(): Promise<DictationSubjectSummary[]> {
  await requireAdmin()
  return dictation.listSubjects()
}

export async function adminCreateDictationSubject(input: { name: string; order?: number }): Promise<DictationSubject> {
  await requireAdmin()
  const subject = await dictation.createSubject(input)
  refresh()
  return subject
}

export async function adminUpdateDictationSubject(
  id: string,
  patch: { name?: string; order?: number },
): Promise<DictationSubject> {
  await requireAdmin()
  const subject = await dictation.updateSubject(id, patch)
  refresh()
  return subject
}

export async function adminDeleteDictationSubject(id: string): Promise<void> {
  await requireAdmin()
  await dictation.deleteSubject(id)
  refresh()
}

// Lessons
export async function adminListDictationLessons(subjectId?: string): Promise<DictationLesson[]> {
  await requireAdmin()
  return dictation.listLessons(subjectId)
}

export async function adminLoadDictationLesson(
  lessonId: string,
): Promise<{ ok: true; lesson: DictationLessonFull | null } | { ok: false; error: string }> {
  await requireAdmin()
  try {
    return { ok: true, lesson: await dictation.getLessonFull(lessonId) }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/unregistered api key/i.test(message)) {
      return {
        ok: false,
        error: 'Supabase رفض مفتاح الخدمة. راجع SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY في إعدادات الاستضافة وتأكد أنهما من نفس المشروع، ثم أعد النشر.',
      }
    }
    if (/prompt_text/i.test(message)) {
      return {
        ok: false,
        error: 'تعذر قراءة إعدادات التصحيح. شغّل migration 20261025000100_dictation_grading_prompt.sql في Supabase ثم أعد المحاولة.',
      }
    }
    return { ok: false, error: `تعذر تحميل بيانات الدرس من Supabase: ${message || 'خطأ غير معروف'}` }
  }
}

export async function adminCreateDictationLesson(input: {
  subjectId: string
  title: string
  description?: string
  order?: number
}): Promise<AdminActionResult<DictationLesson>> {
  return runAdminAction(async () => {
    await requireAdmin()
    const lesson = await dictation.createLesson(input)
    refresh()
    return lesson
  })
}

export async function adminUpdateDictationLesson(
  id: string,
  patch: { title?: string; description?: string; order?: number; subjectId?: string },
): Promise<AdminActionResult<DictationLesson>> {
  return runAdminAction(async () => {
    await requireAdmin()
    const lesson = await dictation.updateLesson(id, patch)
    refresh()
    return lesson
  })
}

export async function adminDeleteDictationLesson(id: string): Promise<void> {
  await requireAdmin()
  await dictation.deleteLesson(id)
  refresh()
}

// Content (headings)
export async function adminSaveDictationHeadings(lessonId: string, headings: HeadingInput[]): Promise<DictationHeading[]> {
  await requireAdmin()
  const saved = await dictation.saveLessonHeadings(lessonId, headings)
  refresh()
  return saved
}

export async function adminSaveDictationHeading(lessonId: string, heading: HeadingInput): Promise<DictationHeading> {
  await requireAdmin()
  const saved = await dictation.saveHeading(lessonId, heading)
  refresh()
  return saved
}

export async function adminDeleteDictationHeadings(lessonId: string, ids: string[]): Promise<void> {
  await requireAdmin()
  await dictation.deleteHeadings(lessonId, ids)
  refresh()
}

export async function adminReorderDictationHeadings(lessonId: string, orderedIds: string[]): Promise<DictationHeading[]> {
  await requireAdmin()
  const saved = await dictation.reorderHeadings(lessonId, orderedIds)
  refresh()
  return saved
}

// Reference (text or PDF)
export async function adminSaveDictationReferenceText(
  lessonId: string,
  text: string,
): Promise<AdminActionResult<DictationReference>> {
  return runAdminAction(async () => {
    await requireAdmin()
    const reference = await dictation.setReferenceText(lessonId, text)
    refresh()
    return reference
  })
}

export async function adminSaveDictationGradingPrompt(
  lessonId: string,
  prompt: string,
): Promise<AdminActionResult<DictationReference>> {
  return runAdminAction(async () => {
    await requireAdmin()
    const reference = await dictation.setReferencePrompt(lessonId, prompt)
    refresh()
    return reference
  })
}

export async function adminCreateDictationPdfUpload(lessonId: string): Promise<{ path: string; token: string }> {
  await requireAdmin()
  return dictation.createReferencePdfUpload(lessonId)
}

export async function adminAttachDictationPdf(
  lessonId: string,
  file: { path: string; name: string },
): Promise<DictationReference> {
  await requireAdmin()
  const reference = await dictation.attachReferencePdf(lessonId, file)
  refresh()
  return reference
}

export async function adminClearDictationReference(lessonId: string): Promise<void> {
  await requireAdmin()
  await dictation.clearReference(lessonId)
  refresh()
}

export async function adminGetDictationPdfUrl(lessonId: string): Promise<string | null> {
  await requireAdmin()
  return dictation.getReferencePdfUrl(lessonId)
}
