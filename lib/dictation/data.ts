import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '../supabase/admin'
import { buildHeadingTree, normalizeHeadings } from './headings'
import {
  DICTATION_LIMITS,
  DICTATION_PDF_BUCKET,
  type DictationHeading,
  type DictationLesson,
  type DictationLessonFull,
  type DictationReference,
  type DictationSubject,
  type DictationSubjectSummary,
  type DictationStudentImage,
  type HeadingInput,
  type ReferenceKind,
} from './types'

/**
 * Written dictation data layer (CRUD). Uses only the dictation_* tables and the
 * dictation-references storage bucket; it never reads or writes the flashcards tables.
 * No authorization here: callers (server actions / pages) must check access first.
 */

const now = () => new Date().toISOString()
const fail = (error: { message: string }): never => {
  throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type SubjectRow = { id: string; name: string; position: number; created_at: string; updated_at: string }
type LessonRow = {
  id: string
  subject_id: string
  title: string
  description: string
  position: number
  created_at: string
  updated_at: string
}
type HeadingRow = {
  id: string
  lesson_id: string
  parent_id: string | null
  level: 'main' | 'sub'
  title: string
  position: number
  floating: 'none' | 'up' | 'down'
  content: string
}
type ReferenceRow = {
  lesson_id: string
  kind: ReferenceKind
  reference_text: string
  prompt_text?: string
  pdf_path: string | null
  pdf_name: string | null
  pdf_size: number | null
  updated_at: string
}

const SUBJECT_COLS = 'id, name, position, created_at, updated_at'
const LESSON_COLS = 'id, subject_id, title, description, position, created_at, updated_at'
const HEADING_COLS = 'id, lesson_id, parent_id, level, title, position, floating, content'
const REFERENCE_COLS = 'lesson_id, kind, reference_text, prompt_text, pdf_path, pdf_name, pdf_size, updated_at'
const LEGACY_REFERENCE_COLS = 'lesson_id, kind, reference_text, pdf_path, pdf_name, pdf_size, updated_at'

function isMissingPromptColumn(error: { code?: string; message: string }) {
  return error.code === '42703' || /prompt_text.*(column|schema cache)|column.*prompt_text/i.test(error.message)
}

function isUnregisteredApiKey(error: { message: string }) {
  return /unregistered api key/i.test(error.message)
}

function failReference(error: { code?: string; message: string }): never {
  if (isUnregisteredApiKey(error)) {
    throw new Error('Supabase رفض مفتاح الخدمة. راجع SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY وتأكد أنهما من نفس مشروع Supabase.')
  }
  if (isMissingPromptColumn(error)) {
    throw new Error('قاعدة البيانات تحتاج تحديثًا. شغّل migration 20261025000100_dictation_grading_prompt.sql في Supabase.')
  }
  return fail(error)
}

const toSubject = (r: SubjectRow): DictationSubject => ({
  id: r.id,
  name: r.name,
  order: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const toLesson = (r: LessonRow): DictationLesson => ({
  id: r.id,
  subjectId: r.subject_id,
  title: r.title,
  description: r.description,
  order: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const toHeading = (r: HeadingRow): DictationHeading => ({
  id: r.id,
  lessonId: r.lesson_id,
  parentId: r.parent_id,
  level: r.level,
  title: r.title,
  order: r.position,
  floating: r.floating,
  content: r.content,
})

const emptyReference = (lessonId: string): DictationReference => ({
  lessonId,
  kind: 'none',
  text: '',
  prompt: '',
  pdf: null,
  updatedAt: null,
})

const toReference = (r: ReferenceRow): DictationReference => ({
  lessonId: r.lesson_id,
  kind: r.kind,
  text: r.reference_text,
  prompt: r.prompt_text ?? '',
  pdf: r.pdf_path ? { path: r.pdf_path, name: r.pdf_name ?? 'reference.pdf', size: r.pdf_size ?? 0 } : null,
  updatedAt: r.updated_at,
})

function cleanText(value: string, max: number, label: string) {
  const text = (value ?? '').trim()
  if (!text) throw new Error(`${label} cannot be empty.`)
  if (text.length > max) throw new Error(`${label} is too long (max ${max} characters).`)
  return text
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export async function listSubjects(): Promise<DictationSubjectSummary[]> {
  const [subjects, lessons] = await Promise.all([
    db().from('dictation_subjects').select(SUBJECT_COLS).order('position').order('created_at'),
    db().from('dictation_lessons').select('subject_id'),
  ])
  if (subjects.error) fail(subjects.error)
  if (lessons.error) fail(lessons.error)

  const counts = new Map<string, number>()
  for (const row of lessons.data ?? []) counts.set(row.subject_id, (counts.get(row.subject_id) ?? 0) + 1)
  return (subjects.data as SubjectRow[]).map((row) => ({ ...toSubject(row), lessonCount: counts.get(row.id) ?? 0 }))
}

export async function getSubject(id: string): Promise<DictationSubject | null> {
  const { data, error } = await db().from('dictation_subjects').select(SUBJECT_COLS).eq('id', id).maybeSingle()
  if (error) fail(error)
  return data ? toSubject(data as SubjectRow) : null
}

export async function createSubject(input: { name: string; order?: number }): Promise<DictationSubject> {
  const name = cleanText(input.name, DICTATION_LIMITS.subjectName, 'Subject name')
  let position = input.order
  if (position === undefined) {
    const { data, error } = await db()
      .from('dictation_subjects')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
    if (error) fail(error)
    position = (data?.[0]?.position ?? 0) + 1
  }
  const { data, error } = await db()
    .from('dictation_subjects')
    .insert({ id: randomUUID(), name, position })
    .select(SUBJECT_COLS)
    .single()
  if (error) fail(error)
  return toSubject(data as SubjectRow)
}

export async function updateSubject(id: string, patch: { name?: string; order?: number }): Promise<DictationSubject> {
  const update: Record<string, unknown> = { updated_at: now() }
  if (patch.name !== undefined) update.name = cleanText(patch.name, DICTATION_LIMITS.subjectName, 'Subject name')
  if (patch.order !== undefined) update.position = Math.trunc(patch.order)
  const { data, error } = await db()
    .from('dictation_subjects')
    .update(update)
    .eq('id', id)
    .select(SUBJECT_COLS)
    .maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('Subject not found.')
  return toSubject(data as SubjectRow)
}

/** Deletes the subject together with its lessons, headings and references (cascade). */
export async function deleteSubject(id: string): Promise<void> {
  // Uploaded files live in storage, which the database cascade cannot reach.
  const { data: lessons, error: lessonsError } = await db().from('dictation_lessons').select('id').eq('subject_id', id)
  if (lessonsError) fail(lessonsError)
  const paths = await referencePdfPaths((lessons ?? []).map((l) => l.id as string))
  const { error } = await db().from('dictation_subjects').delete().eq('id', id)
  if (error) fail(error)
  await removePdfObjects(paths)
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function listLessons(subjectId?: string): Promise<DictationLesson[]> {
  let query = db().from('dictation_lessons').select(LESSON_COLS).order('position').order('created_at')
  if (subjectId) query = query.eq('subject_id', subjectId)
  const { data, error } = await query
  if (error) fail(error)
  return (data as LessonRow[]).map(toLesson)
}

export async function getLesson(id: string): Promise<DictationLesson | null> {
  const { data, error } = await db().from('dictation_lessons').select(LESSON_COLS).eq('id', id).maybeSingle()
  if (error) fail(error)
  return data ? toLesson(data as LessonRow) : null
}

export async function createLesson(input: {
  subjectId: string
  title: string
  description?: string
  order?: number
}): Promise<DictationLesson> {
  const title = cleanText(input.title, DICTATION_LIMITS.lessonTitle, 'Lesson title')
  const description = (input.description ?? '').trim().slice(0, DICTATION_LIMITS.lessonDescription)
  if (!(await getSubject(input.subjectId))) throw new Error('Subject not found.')

  let position = input.order
  if (position === undefined) {
    const { data, error } = await db()
      .from('dictation_lessons')
      .select('position')
      .eq('subject_id', input.subjectId)
      .order('position', { ascending: false })
      .limit(1)
    if (error) fail(error)
    position = (data?.[0]?.position ?? 0) + 1
  }
  const { data, error } = await db()
    .from('dictation_lessons')
    .insert({ id: randomUUID(), subject_id: input.subjectId, title, description, position })
    .select(LESSON_COLS)
    .single()
  if (error) fail(error)
  return toLesson(data as LessonRow)
}

/** Edits a lesson. Passing `subjectId` moves it to another subject. */
export async function updateLesson(
  id: string,
  patch: { title?: string; description?: string; order?: number; subjectId?: string },
): Promise<DictationLesson> {
  const update: Record<string, unknown> = { updated_at: now() }
  if (patch.title !== undefined) update.title = cleanText(patch.title, DICTATION_LIMITS.lessonTitle, 'Lesson title')
  if (patch.description !== undefined) {
    update.description = patch.description.trim().slice(0, DICTATION_LIMITS.lessonDescription)
  }
  if (patch.order !== undefined) update.position = Math.trunc(patch.order)
  if (patch.subjectId !== undefined) {
    if (!(await getSubject(patch.subjectId))) throw new Error('Subject not found.')
    update.subject_id = patch.subjectId
  }
  const { data, error } = await db().from('dictation_lessons').update(update).eq('id', id).select(LESSON_COLS).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('Lesson not found.')
  return toLesson(data as LessonRow)
}

/** Deletes the lesson together with its headings and reference (cascade), and its uploaded files. */
export async function deleteLesson(id: string): Promise<void> {
  const paths = await referencePdfPaths([id])
  const { error } = await db().from('dictation_lessons').delete().eq('id', id)
  if (error) fail(error)
  await removePdfObjects(paths)
}

// ---------------------------------------------------------------------------
// Content (headings)
// ---------------------------------------------------------------------------

export async function listHeadings(lessonId: string): Promise<DictationHeading[]> {
  const { data, error } = await db().from('dictation_headings').select(HEADING_COLS).eq('lesson_id', lessonId)
  if (error) fail(error)
  const headings = (data as HeadingRow[]).map(toHeading)
  // Reading order: main headings by order, each followed by its sub headings.
  return buildHeadingTree(headings).flatMap(({ children, ...main }) => [main, ...children])
}

/**
 * Replaces the whole heading list of a lesson with `inputs` (create + edit + delete in one call).
 * Headings that are not in `inputs` are deleted; `order` is renumbered among siblings.
 */
export async function saveLessonHeadings(lessonId: string, inputs: HeadingInput[]): Promise<DictationHeading[]> {
  if (!(await getLesson(lessonId))) throw new Error('Lesson not found.')
  const rows = normalizeHeadings(inputs, randomUUID)
  const timestamp = now()

  if (rows.length) {
    const { error } = await db()
      .from('dictation_headings')
      .upsert(
        rows.map((h) => ({
          id: h.id,
          lesson_id: lessonId,
          parent_id: h.parentId,
          level: h.level,
          title: h.title,
          position: h.order,
          floating: h.floating,
          content: h.content,
          updated_at: timestamp,
        })),
        { onConflict: 'id' },
      )
    if (error) fail(error)
  }

  const { data: existing, error: existingError } = await db()
    .from('dictation_headings')
    .select('id')
    .eq('lesson_id', lessonId)
  if (existingError) fail(existingError)
  const keep = new Set(rows.map((r) => r.id))
  const stale = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id))
  if (stale.length) {
    const { error } = await db().from('dictation_headings').delete().eq('lesson_id', lessonId).in('id', stale)
    if (error) fail(error)
  }
  await touchLesson(lessonId)
  return listHeadings(lessonId)
}

/** Creates or edits a single heading. Sub headings must point at a main heading of the same lesson. */
export async function saveHeading(lessonId: string, input: HeadingInput): Promise<DictationHeading> {
  const current = await listHeadings(lessonId)
  const id = input.id ?? randomUUID()
  const exists = current.some((h) => h.id === id)
  const merged: HeadingInput[] = current.map((h) => ({
    id: h.id,
    parentId: h.parentId,
    level: h.level,
    title: h.title,
    order: h.order,
    floating: h.floating,
    content: h.content,
  }))
  if (exists) {
    const i = merged.findIndex((h) => h.id === id)
    merged[i] = { ...merged[i], ...input, id }
  } else {
    // Append after the existing siblings unless an explicit order was given.
    const siblings = current.filter((h) => h.level === input.level && h.parentId === (input.parentId ?? null))
    merged.push({ ...input, id, order: input.order ?? siblings.length + 1 })
  }
  const saved = await saveLessonHeadings(lessonId, merged)
  const heading = saved.find((h) => h.id === id)
  if (!heading) throw new Error('Heading was not saved.')
  return heading
}

/** Deletes headings by id. Deleting a main heading also deletes its sub headings. */
export async function deleteHeadings(lessonId: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await db().from('dictation_headings').delete().eq('lesson_id', lessonId).in('id', ids)
  if (error) fail(error)
  await touchLesson(lessonId)
}

/** Reorders sibling headings: `orderedIds` are renumbered 1..n in the given order. */
export async function reorderHeadings(lessonId: string, orderedIds: string[]): Promise<DictationHeading[]> {
  const current = await listHeadings(lessonId)
  const positions = new Map(orderedIds.map((id, i) => [id, i + 1]))
  const inputs: HeadingInput[] = current.map((h) => ({
    id: h.id,
    parentId: h.parentId,
    level: h.level,
    title: h.title,
    floating: h.floating,
    content: h.content,
    order: positions.get(h.id) ?? Number.MAX_SAFE_INTEGER,
  }))
  return saveLessonHeadings(lessonId, inputs)
}

// ---------------------------------------------------------------------------
// Reference (text or PDF)
// ---------------------------------------------------------------------------

export async function getReference(lessonId: string): Promise<DictationReference> {
  const result = await db()
    .from('dictation_references')
    .select(REFERENCE_COLS)
    .eq('lesson_id', lessonId)
    .maybeSingle()
  if (result.error && isMissingPromptColumn(result.error)) {
    const legacy = await db()
      .from('dictation_references')
      .select(LEGACY_REFERENCE_COLS)
      .eq('lesson_id', lessonId)
      .maybeSingle()
    if (legacy.error) failReference(legacy.error)
    return legacy.data ? toReference(legacy.data as ReferenceRow) : emptyReference(lessonId)
  }
  if (result.error) failReference(result.error)
  return result.data ? toReference(result.data as ReferenceRow) : emptyReference(lessonId)
}

async function upsertReference(values: Record<string, unknown>, allowLegacyPrompt = true) {
  const { error } = await db().from('dictation_references').upsert(values, { onConflict: 'lesson_id' })
  if (!error) return
  if ('prompt_text' in values && isMissingPromptColumn(error)) {
    if (!allowLegacyPrompt) failReference(error)
    const { prompt_text: _promptText, ...legacyValues } = values
    const retry = await db().from('dictation_references').upsert(legacyValues, { onConflict: 'lesson_id' })
    if (!retry.error) return
    failReference(retry.error)
  }
  failReference(error)
}

/** Saves the reference as plain text. An empty text clears the reference. */
export async function setReferenceText(lessonId: string, text: string): Promise<DictationReference> {
  if (!(await getLesson(lessonId))) throw new Error('Lesson not found.')
  if (text.length > DICTATION_LIMITS.referenceText) throw new Error('Reference text is too large.')
  const previous = await getReference(lessonId)
  const trimmed = text.trim()
  await upsertReference({
    lesson_id: lessonId,
    kind: trimmed ? 'text' : 'none',
    reference_text: trimmed ? text : '',
    prompt_text: previous.prompt,
    pdf_path: null,
    pdf_name: null,
    pdf_size: null,
    updated_at: now(),
  })
  if (previous.pdf) await removePdfObjects([previous.pdf.path])
  return getReference(lessonId)
}

/** Saves per-lesson grading instructions without changing its text or PDF reference. */
export async function setReferencePrompt(lessonId: string, prompt: string): Promise<DictationReference> {
  if (!(await getLesson(lessonId))) throw new Error('Lesson not found.')
  if (prompt.length > DICTATION_LIMITS.gradingPrompt) throw new Error('Grading instructions are too large.')
  const previous = await getReference(lessonId)
  const values = {
    lesson_id: lessonId,
    kind: previous.kind,
    reference_text: previous.text,
    prompt_text: prompt,
    pdf_path: previous.pdf?.path ?? null,
    pdf_name: previous.pdf?.name ?? null,
    pdf_size: previous.pdf?.size ?? null,
    updated_at: now(),
  }
  await upsertReference(values, false)
  return getReference(lessonId)
}

/**
 * Step 1 of a PDF upload: returns a one-time signed URL token so the browser uploads the file
 * straight to storage (server actions have a small body limit, so PDFs do not go through them).
 */
export async function createReferencePdfUpload(lessonId: string): Promise<{ path: string; token: string }> {
  if (!(await getLesson(lessonId))) throw new Error('Lesson not found.')
  const path = `${lessonId}/${randomUUID()}.pdf`
  const { data, error } = await db().storage.from(DICTATION_PDF_BUCKET).createSignedUploadUrl(path)
  if (error) fail(error)
  return { path, token: data!.token }
}

/** Step 2 of a PDF upload: verifies the uploaded object and makes it the lesson's reference. */
export async function attachReferencePdf(
  lessonId: string,
  file: { path: string; name: string },
): Promise<DictationReference> {
  if (!(await getLesson(lessonId))) throw new Error('Lesson not found.')
  if (!file.path.startsWith(`${lessonId}/`) || !file.path.endsWith('.pdf') || file.path.includes('..')) {
    throw new Error('Invalid PDF path.')
  }
  const fileName = file.path.slice(lessonId.length + 1)
  const { data: found, error: listError } = await db().storage.from(DICTATION_PDF_BUCKET).list(lessonId, { search: fileName })
  if (listError) fail(listError)
  const object = (found ?? []).find((o) => o.name === fileName)
  if (!object) throw new Error('The PDF was not uploaded.')
  const size = Number((object.metadata as { size?: number } | null)?.size ?? 0)
  if (size > DICTATION_LIMITS.pdfBytes) {
    await removePdfObjects([file.path])
    throw new Error('The PDF is too large (max 20 MB).')
  }

  const previous = await getReference(lessonId)
  await upsertReference({
    lesson_id: lessonId,
    kind: 'pdf',
    reference_text: '',
    prompt_text: previous.prompt,
    pdf_path: file.path,
    pdf_name: (file.name || 'reference.pdf').slice(0, 200),
    pdf_size: size,
    updated_at: now(),
  })
  if (previous.pdf && previous.pdf.path !== file.path) await removePdfObjects([previous.pdf.path])
  await touchLesson(lessonId)
  return getReference(lessonId)
}

/** Creates a one-time upload URL for an image shown on the student lesson page. */
export async function createStudentImageUpload(
  lessonId: string,
  input: { name: string; contentType: string; size: number },
): Promise<{ path: string; token: string }> {
  if (!(await getLesson(lessonId))) throw new Error('Lesson not found.')
  if (!/^image\/(jpeg|png|webp|gif)$/.test(input.contentType)) throw new Error('Unsupported image type.')
  if (input.size <= 0 || input.size > DICTATION_LIMITS.studentImageBytes) {
    throw new Error('Image must be 10 MB or smaller.')
  }
  const extension = input.contentType === 'image/jpeg' ? 'jpg' : input.contentType.slice('image/'.length)
  const path = `${lessonId}/student/${randomUUID()}.${extension}`
  const { data, error } = await db().storage.from(DICTATION_PDF_BUCKET).createSignedUploadUrl(path)
  if (error) fail(error)
  return { path, token: data!.token }
}

/** Saves the student-visible text and image references, removing images no longer used. */
export async function setStudentMaterial(
  lessonId: string,
  text: string,
  images: Array<{ path: string; name: string }>,
): Promise<void> {
  if (!(await getLesson(lessonId))) throw new Error('Lesson not found.')
  if (text.length > DICTATION_LIMITS.referenceText) throw new Error('Student material is too large.')
  if (images.length > DICTATION_LIMITS.studentImagesPerLesson) throw new Error('Too many student images.')
  const normalized = images.map((image) => {
    if (!image.path.startsWith(`${lessonId}/student/`) || image.path.includes('..')) {
      throw new Error('Invalid student image path.')
    }
    return { path: image.path, name: image.name.slice(0, 200) }
  })
  const { data: existing, error: readError } = await db()
    .from('dictation_lessons')
    .select('student_images')
    .eq('id', lessonId)
    .single()
  if (readError) fail(readError)
  if (!existing) throw new Error('Lesson not found.')
  const previous = parseStudentImages(existing.student_images)
  const { error } = await db()
    .from('dictation_lessons')
    .update({ student_material: text, student_images: normalized, updated_at: now() })
    .eq('id', lessonId)
  if (error) fail(error)
  const retained = new Set(normalized.map((image) => image.path))
  await removePdfObjects(previous.filter((image) => !retained.has(image.path)).map((image) => image.path))
}

function parseStudentImages(value: unknown): Array<{ path: string; name: string }> {
  if (!Array.isArray(value)) return []
  return value.filter(
    (image): image is { path: string; name: string } =>
      !!image && typeof image === 'object' &&
      typeof image.path === 'string' && typeof image.name === 'string',
  )
}

export async function clearReference(lessonId: string): Promise<void> {
  const previous = await getReference(lessonId)
  await upsertReference({
    lesson_id: lessonId,
    kind: 'none',
    reference_text: '',
    prompt_text: previous.prompt,
    pdf_path: null,
    pdf_name: null,
    pdf_size: null,
    updated_at: now(),
  })
  if (previous.pdf) await removePdfObjects([previous.pdf.path])
}

/** Short-lived download link for a lesson's reference PDF, or null when it has none. */
export async function getReferencePdfUrl(lessonId: string, expiresInSeconds = 600): Promise<string | null> {
  const reference = await getReference(lessonId)
  if (!reference.pdf) return null
  const { data, error } = await db()
    .storage.from(DICTATION_PDF_BUCKET)
    .createSignedUrl(reference.pdf.path, expiresInSeconds)
  if (error) fail(error)
  return data?.signedUrl ?? null
}

// ---------------------------------------------------------------------------
// Composite reads
// ---------------------------------------------------------------------------

export async function getLessonFull(lessonId: string): Promise<DictationLessonFull | null> {
  const lesson = await getLesson(lessonId)
  if (!lesson) return null
  const [headings, reference, material] = await Promise.all([
    listHeadings(lessonId),
    getReference(lessonId),
    db().from('dictation_lessons').select('student_material, student_images').eq('id', lessonId).single(),
  ])
  if (material.error) fail(material.error)
  if (!material.data) throw new Error('Lesson material not found.')
  const images = parseStudentImages(material.data.student_images)
  const studentImages = await Promise.all(
    images.map(async (image): Promise<DictationStudentImage> => {
      const { data, error } = await db().storage.from(DICTATION_PDF_BUCKET).createSignedUrl(image.path, 60 * 60 * 24)
      if (error) fail(error)
      if (!data) throw new Error('Could not create a signed URL for a student image.')
      return { ...image, url: data.signedUrl }
    }),
  )
  return {
    lesson,
    headings,
    tree: buildHeadingTree(headings),
    reference,
    studentMaterial: { text: material.data.student_material, images: studentImages },
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function touchLesson(lessonId: string) {
  await db().from('dictation_lessons').update({ updated_at: now() }).eq('id', lessonId)
}

async function referencePdfPaths(lessonIds: string[]): Promise<string[]> {
  if (!lessonIds.length) return []
  const [references, lessons] = await Promise.all([
    db().from('dictation_references').select('pdf_path').in('lesson_id', lessonIds),
    db().from('dictation_lessons').select('student_images').in('id', lessonIds),
  ])
  if (references.error) fail(references.error)
  if (lessons.error) fail(lessons.error)
  const pdfs = (references.data ?? []).map((r) => r.pdf_path as string | null).filter((p): p is string => !!p)
  const images = (lessons.data ?? []).flatMap((lesson) => parseStudentImages(lesson.student_images).map((image) => image.path))
  return [...pdfs, ...images]
}

/** Best effort: a leftover file is harmless, so storage errors never fail the main operation. */
async function removePdfObjects(paths: string[]) {
  if (!paths.length) return
  try {
    await db().storage.from(DICTATION_PDF_BUCKET).remove(paths)
  } catch {
    // ignore
  }
}
