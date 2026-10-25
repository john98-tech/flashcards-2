/**
 * Written dictation ("التسميع بالكتابة") types.
 * Pure types and constants: safe to import from both server and client code.
 * Independent of the flashcards types in lib/cloze.ts.
 */

export const HEADING_LEVELS = ['main', 'sub'] as const
export type HeadingLevel = (typeof HEADING_LEVELS)[number]

/** none = fixed position, up = may appear earlier than its order, down = may appear later. */
export const HEADING_FLOATING = ['none', 'up', 'down'] as const
export type HeadingFloating = (typeof HEADING_FLOATING)[number]

export const REFERENCE_KINDS = ['none', 'text', 'pdf'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

export const DICTATION_LIMITS = {
  subjectName: 120,
  lessonTitle: 200,
  lessonDescription: 500,
  headingTitle: 300,
  headingContent: 20_000,
  headingsPerLesson: 500,
  referenceText: 2_000_000,
  gradingPrompt: 100_000,
  pdfBytes: 20 * 1024 * 1024,
} as const

export const DICTATION_PDF_BUCKET = 'dictation-references'

export type DictationSubject = {
  id: string
  name: string
  order: number
  createdAt: string
  updatedAt: string
}

export type DictationLesson = {
  id: string
  subjectId: string
  title: string
  description: string
  order: number
  createdAt: string
  updatedAt: string
}

export type DictationHeading = {
  id: string
  lessonId: string
  /** null for main headings, the main heading's id for sub headings. */
  parentId: string | null
  level: HeadingLevel
  title: string
  /** Position among siblings (1-based). */
  order: number
  floating: HeadingFloating
  /** Optional expected text under the heading. */
  content: string
}

export type HeadingInput = {
  id?: string
  parentId?: string | null
  level: HeadingLevel
  title: string
  order?: number
  floating?: HeadingFloating
  content?: string
}

export type HeadingNode = DictationHeading & { children: DictationHeading[] }

export type DictationReference = {
  lessonId: string
  kind: ReferenceKind
  text: string
  prompt: string
  pdf: { path: string; name: string; size: number } | null
  updatedAt: string | null
}

export type DictationLessonFull = {
  lesson: DictationLesson
  headings: DictationHeading[]
  tree: HeadingNode[]
  reference: DictationReference
}

export type DictationSubjectSummary = DictationSubject & { lessonCount: number }
