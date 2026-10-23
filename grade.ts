import { generate, type GeminiConfig } from './gemini'

export type Report = {
  score: number
  verdict: string
  transcription?: string
  correct: string[]
  wrong: { written: string; correct: string; why: string }[]
  misplaced: { written: string; expectedHeading: string; actualHeading: string; why: string }[]
  spelling: { written: string; correct: string }[]
  missing: { topic: string; detail: string }[]
  tips: string
}

const S = 'STRING'
const schema = {
  type: 'OBJECT',
  properties: {
    score: { type: 'INTEGER' },
    verdict: { type: S },
    transcription: { type: S },
    correct: { type: 'ARRAY', items: { type: S } },
    wrong: { type: 'ARRAY', items: { type: 'OBJECT', properties: { written: { type: S }, correct: { type: S }, why: { type: S } }, required: ['written', 'correct', 'why'] } },
    misplaced: { type: 'ARRAY', items: { type: 'OBJECT', properties: { written: { type: S }, expectedHeading: { type: S }, actualHeading: { type: S }, why: { type: S } }, required: ['written', 'expectedHeading', 'actualHeading', 'why'] } },
    spelling: { type: 'ARRAY', items: { type: 'OBJECT', properties: { written: { type: S }, correct: { type: S } }, required: ['written', 'correct'] } },
    missing: { type: 'ARRAY', items: { type: 'OBJECT', properties: { topic: { type: S }, detail: { type: S } }, required: ['topic', 'detail'] } },
    tips: { type: S },
  },
  required: ['score', 'verdict', 'correct', 'wrong', 'misplaced', 'spelling', 'missing', 'tips'],
}

const SYSTEM = `You are a strict but kind examiner grading a student's written recitation of a lesson.
The REFERENCE (text and/or image) is the single source of truth. Compare the student's work against it carefully and systematically.
Rules:
- Treat the reference as the authoritative answer key. Never use outside knowledge to mark a fact wrong.
- Review the entire reference from beginning to end, including details, definitions, examples, numbers, units, sequences, causes/effects, exceptions, and relationships. Compare each meaningful claim in the student's answer with the reference.
- Find factual mistakes (wrong value, wrong term, reversed relation, wrong order, or inaccurate explanation). Quote what the student wrote EXACTLY in "written", give the right version in "correct", and a concise reason in "why".
- Check whether facts are placed under the correct heading/subheading. If a correct fact is written under a clearly unrelated heading, put it in "misplaced" with the exact claim, expected heading, actual heading, and reason. Do not duplicate the same issue in "wrong".
- Find important points from the reference that the student did NOT mention ("missing"), most important first. Include enough detail to identify the omitted fact; do not count harmless rephrasing as missing.
- Find spelling mistakes in technical/English terms and Arabic words. Quote exactly in "written" and provide the correction. Do not flag stylistic differences or acceptable transliterations as factual errors.
- "correct": concise list of important points the student got right.
- Do not penalise formatting or a different order of sections by itself. Only flag heading placement when the fact is under a genuinely incorrect heading.
- Do not invent facts, quotes, omissions, or corrections. If the reference is ambiguous, unreadable, or does not support a confident judgment, skip that issue.
- Avoid duplicate findings across wrong, misplaced, spelling, and missing categories.
- score: 0-100 reflecting factual accuracy and coverage of important reference points. Apply deductions proportionally; do not let spelling dominate the score. verdict: one encouraging sentence. tips: 1-3 specific sentences on what to review.
- If handwriting images are included, transcribe them faithfully into "transcription" and grade that transcription together with typed text. If handwriting is unclear, mark uncertain words cautiously instead of guessing.
- Write explanations in Egyptian Arabic (simple, friendly) but keep technical terms and quotes in their original language.`

export async function gradeAttempt(
  config: GeminiConfig,
  input: {
    title: string
    outline: string
    reference: string
    referenceImage?: { mimeType: string; data: string } | null
    typed: string
    ink: { mimeType: string; data: string }[]
  },
  signal?: AbortSignal,
): Promise<Report> {
  const prompt = [
    `LESSON: ${input.title}`,
    input.outline ? `MAIN HEADINGS GIVEN TO STUDENT (use these to judge placement):\n${input.outline}` : '',
    `REFERENCE TEXT:\n${input.reference || '(none, use the reference image)'}`,
    input.referenceImage ? 'The FIRST attached image is the reference lesson page.' : '',
    input.ink.length ? `The ${input.referenceImage ? 'remaining' : ''} attached image(s) are the student's HANDWRITTEN pages, in order.` : '',
    `STUDENT TYPED TEXT:\n${input.typed || '(empty)'}`,
    'Audit checklist: cover the reference sequentially; identify wrong claims, omitted key facts, spelling errors, and correct facts filed under the wrong heading. Return every finding in the matching structured category, without duplicating findings.',
  ]
    .filter(Boolean)
    .join('\n\n')

  const images = [...(input.referenceImage ? [input.referenceImage] : []), ...input.ink]
  const raw = await generate(config, prompt, { system: SYSTEM, responseSchema: schema, temperature: 0.1, images, signal })
  const json = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim())
  return {
    score: Math.max(0, Math.min(100, Number(json.score) || 0)),
    verdict: json.verdict ?? '',
    transcription: json.transcription || undefined,
    correct: json.correct ?? [],
    wrong: json.wrong ?? [],
    misplaced: json.misplaced ?? [],
    spelling: json.spelling ?? [],
    missing: json.missing ?? [],
    tips: json.tips ?? '',
  }
}

export function reportToText(r: Report) {
  const lines = [`النتيجة: ${r.score}/100`, r.verdict, '']
  if (r.wrong.length) lines.push('معلومات غلط:', ...r.wrong.map((w) => `- "${w.written}" ← ${w.correct} (${w.why})`), '')
  if (r.misplaced?.length) lines.push('معلومات في مكان أو عنوان غلط:', ...r.misplaced.map((m) => `- "${m.written}" | العنوان الحالي: ${m.actualHeading} | العنوان الصحيح: ${m.expectedHeading} (${m.why})`), '')
  if (r.spelling.length) lines.push('أخطاء إملائية:', ...r.spelling.map((s) => `- ${s.written} ← ${s.correct}`), '')
  if (r.missing.length) lines.push('معلومات ناقصة:', ...r.missing.map((m) => `- ${m.topic}: ${m.detail}`), '')
  if (r.tips) lines.push(r.tips)
  return lines.join('\n')
}
