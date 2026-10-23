/** Pure helpers for dictation headings (no server-only imports, usable on the client too). */
import {
  DICTATION_LIMITS,
  HEADING_FLOATING,
  HEADING_LEVELS,
  type DictationHeading,
  type HeadingInput,
  type HeadingNode,
} from './types'

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/** Builds main headings with their sub headings, both sorted by `order`. */
export function buildHeadingTree(headings: DictationHeading[]): HeadingNode[] {
  const byOrder = (a: DictationHeading, b: DictationHeading) => a.order - b.order
  const mains = headings.filter((h) => h.level === 'main').sort(byOrder)
  return mains.map((main) => ({
    ...main,
    children: headings.filter((h) => h.level === 'sub' && h.parentId === main.id).sort(byOrder),
  }))
}

/** Reading order of the lesson: each main heading followed by its sub headings. */
export function flattenHeadingTree(tree: HeadingNode[]): DictationHeading[] {
  return tree.flatMap(({ children, ...main }) => [main, ...children])
}

export type NormalizedHeading = Omit<DictationHeading, 'lessonId'>

/**
 * Validates a full list of headings for one lesson and returns clean rows:
 * ids assigned, text trimmed, `order` renumbered 1..n among siblings (input order is kept
 * when `order` is missing or tied). Throws an Error with a readable message on bad input.
 */
export function normalizeHeadings(inputs: HeadingInput[], newId: () => string): NormalizedHeading[] {
  if (inputs.length > DICTATION_LIMITS.headingsPerLesson) {
    throw new Error(`A lesson can have at most ${DICTATION_LIMITS.headingsPerLesson} headings.`)
  }

  const seen = new Set<string>()
  const items = inputs.map((input, index) => {
    const id = input.id ?? newId()
    if (!ID_RE.test(id)) throw new Error('Invalid heading id.')
    if (seen.has(id)) throw new Error('Duplicate heading id.')
    seen.add(id)

    if (!HEADING_LEVELS.includes(input.level)) throw new Error('Invalid heading level.')
    const floating = input.floating ?? 'none'
    if (!HEADING_FLOATING.includes(floating)) throw new Error('Invalid heading floating value.')

    const title = (input.title ?? '').trim()
    if (!title) throw new Error('Heading titles cannot be empty.')
    if (title.length > DICTATION_LIMITS.headingTitle) throw new Error('Heading title is too long.')
    const content = input.content ?? ''
    if (content.length > DICTATION_LIMITS.headingContent) throw new Error('Heading content is too long.')

    return { id, input, index, title, floating, content }
  })

  const levelById = new Map(items.map((it) => [it.id, it.input.level]))
  for (const { input } of items) {
    if (input.level === 'main' && input.parentId) throw new Error('Main headings cannot have a parent.')
    if (input.level === 'sub') {
      if (!input.parentId || levelById.get(input.parentId) !== 'main') {
        throw new Error('Each sub heading must belong to a main heading in the same lesson.')
      }
    }
  }

  const rows: NormalizedHeading[] = []
  const groups = new Map<string | null, typeof items>()
  for (const it of items) {
    const key = it.input.level === 'main' ? null : it.input.parentId!
    const group = groups.get(key) ?? []
    group.push(it)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    group
      .sort((a, b) => (a.input.order ?? a.index + 1) - (b.input.order ?? b.index + 1) || a.index - b.index)
      .forEach((it, i) =>
        rows.push({
          id: it.id,
          parentId: it.input.level === 'main' ? null : it.input.parentId!,
          level: it.input.level,
          title: it.title,
          order: i + 1,
          floating: it.floating,
          content: it.content,
        }),
      )
  }
  return rows
}
