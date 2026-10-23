import { generate, type GeminiConfig } from './gemini'

export type Report = {
  score: number
  verdict: string
  transcription?: string
  correct: string[]
  wrong: { written: string; correct: string; why: string }[]
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
    spelling: { type: 'ARRAY', items: { type: 'OBJECT', properties: { written: { type: S }, correct: { type: S } }, required: ['written', 'correct'] } },
    missing: { type: 'ARRAY', items: { type: 'OBJECT', properties: { topic: { type: S }, detail: { type: S } }, required: ['topic', 'detail'] } },
    tips: { type: S },
  },
  required: ['score', 'verdict', 'correct', 'wrong', 'spelling', 'missing', 'tips'],
}

const SYSTEM = `You are a strict but kind examiner grading a student's written recitation of a lesson.
The REFERENCE (text and/or image) is the single source of truth. Compare the student's work against it.
Rules:
- Find factual mistakes (wrong value, wrong term, reversed relation, wrong order). Quote what the student wrote EXACTLY in "written", give the right version in "correct", and a one-sentence reason in "why".
- Find spelling mistakes in technical/English terms and Arabic words. Quote exactly. Ignore trivial typos in handwriting transcription only if the word is clearly legible and correct.
- List important points from the reference that the student did NOT mention ("missing"), most important first, each with a short detail from the reference.
- "correct": short list of points the student got right.
- Do not penalise formatting, order of sections, or extra correct information that is not in the reference.
- Do not invent facts that are not in the reference. If something cannot be judged from the reference, skip it.
- score: 0-100 reflecting accuracy and completeness. verdict: one encouraging sentence. tips: 1-3 sentences on what to review.
- If the student's work includes handwriting images, first transcribe them faithfully into "transcription" (typed text is already given separately), then grade everything together. Otherwise leave transcription empty.
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
    input.outline ? `MAIN HEADINGS GIVEN TO STUDENT:\n${input.outline}` : '',
    `REFERENCE TEXT:\n${input.reference || '(none, use the reference image)'}`,
    input.referenceImage ? 'The FIRST attached image is the reference lesson page.' : '',
    input.ink.length ? `The ${input.referenceImage ? 'remaining' : ''} attached image(s) are the student's HANDWRITTEN pages, in order.` : '',
    `STUDENT TYPED TEXT:\n${input.typed || '(empty)'}`,
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
    spelling: json.spelling ?? [],
    missing: json.missing ?? [],
    tips: json.tips ?? '',
  }
}

export function reportToText(r: Report) {
  const lines = [`النتيجة: ${r.score}/100`, r.verdict, '']
  if (r.wrong.length) lines.push('معلومات غلط:', ...r.wrong.map((w) => `- "${w.written}" ← ${w.correct} (${w.why})`), '')
  if (r.spelling.length) lines.push('أخطاء إملائية:', ...r.spelling.map((s) => `- ${s.written} ← ${s.correct}`), '')
  if (r.missing.length) lines.push('ناقص:', ...r.missing.map((m) => `- ${m.topic}: ${m.detail}`), '')
  if (r.tips) lines.push(r.tips)
  return lines.join('\n')
}
