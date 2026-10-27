'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Gemini access is "bring your own key": the key lives only in the user's browser
 * (localStorage) and requests go straight from the browser to Google. Nothing is
 * sent to or stored on our servers.
 */
const STORAGE_KEY = 'kwk:gemini'
const EVENT = 'kwk:gemini-change'
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta'
const GROQ_API = 'https://api.groq.com/openai/v1'

export const DEFAULT_MODEL = 'gemini-2.5-flash'
export const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']

export type GeminiConfig = { apiKey: string; model: string; provider?: 'gemini' | 'groq' }

export function readGeminiConfig(): GeminiConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GeminiConfig>
    if (!parsed.apiKey) return null
    return { apiKey: parsed.apiKey, model: parsed.model || DEFAULT_MODEL, provider: parsed.provider === 'groq' ? 'groq' : 'gemini' }
  } catch {
    return null
  }
}

export function saveGeminiConfig(config: GeminiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  window.dispatchEvent(new Event(EVENT))
}

export function clearGeminiConfig() {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(EVENT))
}

/** Reactive access to the saved key. `ready` is false until localStorage has been read. */
export function useGeminiConfig() {
  const [config, setConfig] = useState<GeminiConfig | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sync = () => {
      setConfig(readGeminiConfig())
      setReady(true)
    }
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const save = useCallback((next: GeminiConfig) => saveGeminiConfig(next), [])
  const clear = useCallback(() => clearGeminiConfig(), [])
  return { config, ready, save, clear }
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message)
  }
}

function friendlyError(status: number, message: string, provider: 'gemini' | 'groq' = 'gemini') {
  if (provider === 'groq') {
    if (status === 400 && /model/i.test(message)) return `موديل Groq غير صالح أو غير متاح: ${message}`
    if (status === 401) return 'مفتاح Groq غير صحيح أو منتهي الصلاحية. أنشئ مفتاحًا جديدًا من Groq Console وانسخه كاملًا.'
    if (status === 403) return `Groq رفض الطلب بسبب الصلاحيات أو إعدادات الحساب${message ? `: ${message}` : '.'}`
    if (status === 404) return `الموديل أو المسار غير متاح في Groq${message ? `: ${message}` : '.'}`
    if (status === 429) return 'وصلت لحد الاستخدام أو معدل الطلبات في Groq. راجع حدود حسابك وحاول لاحقًا.'
    if (status >= 500) return 'خدمة Groq فيها مشكلة مؤقتة. جرّب بعد شوية.'
    return message || 'حصل خطأ غير متوقع من Groq.'
  }
  if (status === 400 && /api key/i.test(message)) return 'المفتاح غير صحيح. تأكد إنك نسخته كامل من Google AI Studio.'
  if (status === 401 || status === 403) return 'مفتاح Gemini مرفوض أو مش مسموح له يستخدم الموديل ده.'
  if (status === 404) return 'الموديل ده مش متاح لمفتاحك. جرّب موديل تاني.'
  if (status === 429) return 'وصلت للحد المجاني من Google مؤقتًا. استنى دقيقة وجرّب تاني.'
  if (status >= 500) return 'خدمة Gemini فيها مشكلة دلوقتي. جرّب بعد شوية.'
  return message || 'حصل خطأ غير متوقع من Gemini.'
}
async function request(url: string, init?: RequestInit, provider: 'gemini' | 'groq' = 'gemini') {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new GeminiError('مفيش اتصال بالإنترنت أو الطلب اتحجب.')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const message = json?.error?.message ?? ''
    throw new GeminiError(friendlyError(res.status, message, provider), res.status)
  }
  return json
}

/** Validates the key and returns the Gemini models it can use for text generation. */
export async function listModels(apiKey: string, provider: 'gemini' | 'groq' = 'gemini'): Promise<string[]> {
  if (provider === 'groq') {
    const key = apiKey.trim().replace(/^['\"]|['\"]$/g, '')
    const json = await request(`${GROQ_API}/models`, { headers: { Authorization: `Bearer ${key}` } }, 'groq')
    // The models endpoint also returns audio, transcription, moderation and other
    // models that cannot be used for ordinary chat completions. Keep those out of the picker.
    const names: string[] = (json?.data ?? [])
      .filter((m: { id: string; active?: boolean }) => m.active !== false)
      .map((m: { id: string }) => m.id)
      .filter((n: string) => !!n && !/(whisper|transcrib|speech|tts|guard|embedding|moderation|orpheus)/i.test(n))
    return names.length ? names.sort((a, b) => a.localeCompare(b)) : ['llama-3.3-70b-versatile']
  }
  const json = await request(`${GEMINI_API}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`)
  const names: string[] = (json?.models ?? [])
    .filter(
      (m: { name: string; supportedGenerationMethods?: string[] }) =>
        m.name.startsWith('models/gemini') && m.supportedGenerationMethods?.includes('generateContent'),
    )
    .map((m: { name: string }) => m.name.replace('models/', ''))
    // Hide image/audio/embedding/preview-only variants that are not useful for grading text.
    .filter((n: string) => !/(image|tts|audio|live|embedding|vision|robotics|computer-use|thinking-exp)/.test(n))
  return names.length > 0 ? names : FALLBACK_MODELS
}

export type GenerateOptions = {
  system?: string
  /** Ask Gemini to answer with JSON matching this schema (OpenAPI subset). */
  responseSchema?: unknown
  /** Ask for a JSON reply without a schema. */
  json?: boolean
  temperature?: number
  images?: { mimeType: string; data: string }[]
  signal?: AbortSignal
}

export async function generate(config: GeminiConfig, prompt: string, opts: GenerateOptions = {}): Promise<string> {
  if (config.provider === 'groq') {
    const messages: Array<Record<string, unknown>> = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
    for (const img of opts.images ?? []) content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } })
    messages.push({ role: 'user', content: opts.images?.length ? content : prompt })
    const apiKey = config.apiKey.trim().replace(/^['\\"]|['\\"]$/g, '')
    const wantsJson = !!(opts.json || opts.responseSchema)
    // Groq's strict JSON response_format can fail with json_validate_failed even
    // when the prompt is valid. Use prompt-only JSON mode for compatibility.
    if (wantsJson) {
      const systemIndex = messages.findIndex(message => message.role === 'system')
      const jsonInstruction = 'Return exactly one valid JSON object and nothing else. Do not use Markdown fences or commentary. Escape string contents correctly and close every bracket.'
      if (systemIndex >= 0) {
        messages[systemIndex] = { ...messages[systemIndex], content: String(messages[systemIndex].content) + '\\n\\n' + jsonInstruction }
      } else {
        messages.unshift({ role: 'system', content: jsonInstruction })
      }
    }
    const result = await request(`${GROQ_API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: config.model, messages, temperature: opts.temperature ?? 0.2 }),
      signal: opts.signal,
    }, 'groq')
    const choice = result?.choices?.[0]
    const message = choice?.message
    const rawContent = message?.content
    // OpenAI-compatible providers may return content as a string or as text parts.
    const output = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent.map((part: unknown) => {
            if (typeof part === 'string') return part
            if (part && typeof part === 'object' && 'text' in part) {
              const text = (part as { text?: unknown }).text
              return typeof text === 'string' ? text : ''
            }
            return ''
          }).join('')
        : ''

    if (output.trim()) return output

    // Avoid misreporting a successful HTTP request as a generic empty response.
    // The completion metadata tells us whether the model stopped early or returned
    // a refusal/reasoning-only payload.
    const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : 'غير متاح'
    const messageFields = message && typeof message === 'object' ? Object.keys(message).join(', ') : 'لا توجد'
    const hasReasoning = typeof message?.reasoning === 'string' && !!message.reasoning.trim()
    const refusal = typeof message?.refusal === 'string' && message.refusal.trim()
    const detail = finishReason === 'length'
      ? 'الرد غالبًا اتقطع بسبب حد التوكنات.'
      : refusal
        ? `الموديل رفض الطلب: ${refusal}`
        : hasReasoning
          ? 'الاستجابة فيها reasoning لكن مفيهاش إجابة نهائية في content.'
          : 'الاستجابة لا تحتوي على نص نهائي قابل للعرض.'
    throw new GeminiError(`Groq رجّع استجابة من غير نص نهائي. السبب: ${finishReason}. ${detail} حقول الرسالة: ${messageFields}. جرّب موديل محادثة عادي أو راجع سجل الطلب في Groq.`)
  }
  const parts: unknown[] = [{ text: prompt }]
  for (const img of opts.images ?? []) parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.responseSchema || opts.json
        ? {
            responseMimeType: 'application/json',
            ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
          }
        : {}),
    },
  }
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] }

  const json = await request(`${GEMINI_API}/models/${encodeURIComponent(config.model)}:generateContent`, {
    method: 'POST',
    // Header (not query string) keeps the key out of URLs and browser history.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  const candidate = json?.candidates?.[0]
  const text = (candidate?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) {
    const reason = json?.promptFeedback?.blockReason ?? candidate?.finishReason
    throw new GeminiError(reason ? `Gemini رجّع رد فاضي (${reason}).` : 'Gemini رجّع رد فاضي.')
  }
  return text
}
