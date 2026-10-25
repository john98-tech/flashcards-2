import { generate, type GeminiConfig } from './gemini'

/** رد Gemini بيرجع نص حر (Markdown) وبيتعرض زي ما هو. */
export type Report = { text: string }

/**
 * قواعد وقوانين التصحيح (system prompt).
 * فاضية دلوقتي = Gemini بيرد من غير أي أوامر. لما تجهز القواعد اكتبها هنا.
 */
export const SYSTEM_RULES = ''

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
    'الدرس: ' + input.title,
    input.outline ? 'العناوين:\n' + input.outline : '',
    'المرجع:\n' + (input.reference || '(مفيش نص، شوف صورة المرجع)'),
    input.referenceImage ? 'أول صورة مرفقة هي صفحة المرجع.' : '',
    input.ink.length ? 'باقي الصور المرفقة هي كتابة الطالب بخط اليد.' : '',
    'إجابة الطالب (مكتوبة):\n' + (input.typed || '(فاضية)'),
  ]
    .filter(Boolean)
    .join('\n\n')

  const images = [...(input.referenceImage ? [input.referenceImage] : []), ...input.ink]
  const text = await generate(config, prompt, {
    system: SYSTEM_RULES || undefined,
    temperature: 0.4,
    images,
    signal,
  })
  return { text: text.trim() }
}

export function reportToText(r: Report) {
  return r.text ?? ''
}
