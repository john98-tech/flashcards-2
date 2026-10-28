export type Card = { id: string; cloze: string }

export type Deck = {
  id: string
  groupId: string
  title: string
  subject: string
  description: string
  isFree: boolean
  cards: Card[]
}

export type Segment =
  | { type: 'text'; value: string }
  | { type: 'blank'; value: string; index: number }

export type Token = { text: string; start: number; end: number; space: boolean }

const BLANK_RE = /\{\{([\s\S]+?)\}\}/g
const TOKEN_RE =
  /\s+|[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}'’.\-]*[\p{L}\p{N}\p{M}])?|[^\s\p{L}\p{N}]/gu

export function parseCloze(cloze: string | null | undefined): Segment[] {
  // Older or malformed saved cards may not have a cloze string. Treat them as empty
  // instead of crashing the entire study/admin page during rendering.
  const source = typeof cloze === 'string' ? cloze : ''
  const segments: Segment[] = []
  let last = 0
  let index = 0

  const pushText = (value: string) => {
    if (!value) return
    const previous = segments[segments.length - 1]
    if (previous?.type === 'text') previous.value += value
    else segments.push({ type: 'text', value })
  }

  for (const match of source.matchAll(BLANK_RE)) {
    const at = match.index ?? 0
    if (at > last) pushText(source.slice(last, at))

    // A stored cloze may contain several words in one blank (e.g. {{high cholesterol}}).
    // Render each word as its own independently revealable blank while preserving
    // every original space and punctuation mark as ordinary text.
    for (const token of match[1].matchAll(TOKEN_RE)) {
      const value = token[0]
      if (/^[\p{L}\p{N}]/u.test(value)) {
        segments.push({ type: 'blank', value, index: index++ })
      } else {
        pushText(value)
      }
    }

    last = at + match[0].length
  }
  if (last < source.length) pushText(source.slice(last))
  return segments
}

export function plainText(cloze: string | null | undefined) {
  const source = typeof cloze === 'string' ? cloze : ''
  return source.replace(BLANK_RE, '$1')
}

export function countBlanks(cloze: string | null | undefined) {
  const source = typeof cloze === 'string' ? cloze : ''
  return [...source.matchAll(BLANK_RE)].length
}

export function tokenize(text: string | null | undefined): Token[] {
  const source = typeof text === 'string' ? text : ''
  return [...source.matchAll(TOKEN_RE)].map((m) => {
    const start = m.index ?? 0
    return { text: m[0], start, end: start + m[0].length, space: /^\s+$/.test(m[0]) }
  })
}

export function fromCloze(cloze: string) {
  const ranges: [number, number][] = []
  let text = ''
  for (const seg of parseCloze(cloze)) {
    if (seg.type === 'blank') ranges.push([text.length, text.length + seg.value.length])
    text += seg.value
  }
  const tokens = tokenize(text)
  const selected = new Set<number>()
  tokens.forEach((t, i) => {
    if (!t.space && ranges.some(([s, e]) => t.start >= s && t.end <= e)) selected.add(i)
  })
  return { text, tokens, selected }
}

/** Adjacent selected tokens (separated only by whitespace) merge into one blank. */
export function toCloze(text: string, tokens: Token[], selected: Set<number>) {
  let out = ''
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    if (token.space || !selected.has(i)) {
      out += token.text
      i++
      continue
    }
    let last = i
    while (true) {
      const next = tokens[last + 1]
      if (!next) break
      if (!next.space && selected.has(last + 1)) {
        last++
      } else if (next.space && selected.has(last + 2) && !tokens[last + 2]?.space) {
        last += 2
      } else break
    }
    out += `{{${text.slice(token.start, tokens[last].end)}}}`
    i = last + 1
  }
  return out
}

const UNITS = new Set(
  [
    '%', 's', 'sec', 'second', 'seconds', 'ms', 'min', 'minute', 'minutes', 'h', 'hr', 'hrs',
    'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
    'ml', 'l', 'dl', 'mg', 'g', 'kg', 'mcg', 'µg', 'ng', 'mmhg', 'cmh2o', 'mm', 'cm', 'm',
    'meq', 'mmol', 'mol', 'mosm', 'bpm', 'beats', 'iu', 'u', '°c', '°', 'percent', 'times',
  ].map((u) => u.toLowerCase()),
)

const isUnit = (t?: Token) => !!t && !t.space && UNITS.has(t.text.toLowerCase())

export type AutoOptions = { numbers: boolean; abbreviations: boolean; terms: string[] }

export function autoSelect(text: string, tokens: Token[], opts: AutoOptions, base?: Set<number>) {
  const selected = new Set(base)

  if (opts.numbers) {
    tokens.forEach((t, i) => {
      if (t.space || !/\p{N}/u.test(t.text)) return
      selected.add(i)
      let k = tokens[i + 1]?.space && tokens[i + 1].text.length === 1 ? i + 2 : i + 1
      if (tokens[i + 1]?.text === '%') k = i + 1
      if (isUnit(tokens[k])) {
        selected.add(k)
        while (tokens[k + 1]?.text === '/' && isUnit(tokens[k + 2])) {
          selected.add(k + 1)
          selected.add(k + 2)
          k += 2
        }
      }
    })
    tokens.forEach((t, i) => {
      if (/^[-–—]$/.test(t.text) && selected.has(i - 1) && selected.has(i + 1)) selected.add(i)
    })
  }

  if (opts.abbreviations) {
    tokens.forEach((t, i) => {
      if (/^[A-Z]{2,}\d*$/.test(t.text)) selected.add(i)
    })
  }

  const lower = text.toLowerCase()
  const isWordChar = (c?: string) => !!c && /[\p{L}\p{N}]/u.test(c)
  for (const term of opts.terms) {
    const needle = term.toLowerCase()
    if (needle.length < 2) continue
    let from = 0
    while (true) {
      const at = lower.indexOf(needle, from)
      if (at === -1) break
      const end = at + needle.length
      if (!isWordChar(lower[at - 1]) && !isWordChar(lower[end])) {
        tokens.forEach((t, i) => {
          if (!t.space && t.start < end && t.end > at) selected.add(i)
        })
      }
      from = at + 1
    }
  }

  return selected
}

export function autoCloze(text: string, opts: AutoOptions) {
  const tokens = tokenize(text)
  return toCloze(text, tokens, autoSelect(text, tokens, opts))
}

export function applyTerms(cloze: string, terms: string[]) {
  const { text, tokens, selected } = fromCloze(cloze)
  const next = autoSelect(text, tokens, { numbers: false, abbreviations: false, terms }, selected)
  return toCloze(text, tokens, next)
}

export function prepareText(raw: string, joinLines: boolean) {
  let text = raw.replace(/\r\n?/g, '\n')
  if (joinLines) {
    text = text
      .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
      // join broken lines, but keep Markdown table rows (lines starting with "|") on their own lines
      .replace(/([^\n])\n(?!\s*\n)/g, (m, c: string, offset: number, str: string) => {
        const lineStart = str.lastIndexOf('\n', offset) + 1
        const nextIsRow = str[offset + 2] === '|'
        return str[lineStart] === '|' || nextIsRow ? m : c + ' '
      })
  }
  return text
}

export const CARD_SEPARATOR = '-'.repeat(73)

const SEPARATOR_LINE = /^[ \t]*-{5,}[ \t]*$/m

export function splitIntoCards(raw: string, joinLines: boolean) {
  const text = raw.replace(/\r\n?/g, '\n')
  // Text rewritten by the AI: cards are separated by a line of dashes, and
  // line breaks inside a card (e.g. a diagram) are kept as they are.
  if (SEPARATOR_LINE.test(text)) {
    return text
      .split(/^[ \t]*-{5,}[ \t]*$/m)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
  }
  // Plain pasted text with no separator: one card per paragraph.
  return prepareText(text, joinLines)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export function parseTerms(raw: string) {
  return [
    ...new Set(
      raw
        .split(/\n|،|;/)
        .map((t) => t.replace(/^[\s\-*•\d.)]+/, '').trim())
        .filter((t) => t.length >= 2),
    ),
  ]
}

export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}%/.]+/gu, ' ')
    .trim()
}

export function buildPrompt(text: string) {
  return `You are helping me build fill-in-the-blank (cloze) flashcards from a medical textbook.

You have two tasks. Do both on the text at the end of this message.

TASK 1 - Important words
List the important words or phrases from the text that a student should memorize.

Rules:
- Copy every word or phrase exactly as it appears in the text, character for character, in the same language.
- One word or phrase per line, with no numbering and no explanation.
- Pick: disease names, organs and anatomical structures, hormones, enzymes and receptors, drugs and doses, normal values, causes and effects, scientific terms, and classifications.
- Keep each phrase short (1 to 4 words) and meaningful on its own.
- Never list common or filler words on their own, such as articles (the, a, an), prepositions (of, in, on, at, to, for, with, by, from), conjunctions (and, or, but), pronouns, auxiliary or generic verbs (is, are, was, has, causes), or full sentences. A phrase must not start or end with one of these words (write "adrenal gland", not "the adrenal gland" or "gland of").
- Skip numbers and their units; they are blanked automatically.
- Aim for roughly one phrase per 8 to 12 words.

TASK 2 - Split the text into cards
Rewrite the whole text again, and divide it into flashcards. Each card is a group of sentences that belong together, or one diagram or table.

Rules:
- Do not change, shorten, translate or summarize the wording. Copy the text exactly as it is, only fix line breaks that were broken by the PDF.
- Put each group of sentences in one card. Put each diagram or table in its own card, with its line breaks kept.
- Put this exact line between every two cards, on its own line, with nothing else on it:
${CARD_SEPARATOR}
- Do not put the separator before the first card or after the last card.
- Do not number the cards and do not add titles or comments.

Output format:
Give two separate code blocks and nothing else. The first code block holds the list from TASK 1. The second code block holds the cards from TASK 2.

Text:
"""
${text.trim()}
"""`
}
