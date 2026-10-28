import 'server-only'

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type CorrectionPayload = {
  provider: 'gemini' | 'groq'
  apiKey: string
  model: string
  prompt: string
  system?: string
  temperature?: number
  json?: boolean
  images?: { mimeType: string; data: string }[]
}

function encryptionKey() {
  const value = process.env.AI_JOB_ENCRYPTION_KEY
  if (!value) throw new Error('AI_JOB_ENCRYPTION_KEY is not configured')
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('AI_JOB_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  return key
}

/** Encrypt sensitive job data before it is written to temporary object storage or a queue. */
export function encryptJobPayload(value: CorrectionPayload) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

export function decryptJobPayload(value: string): CorrectionPayload {
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted job payload')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
  const parsed = JSON.parse(decrypted) as CorrectionPayload
  if (!parsed.apiKey || !parsed.model || !parsed.prompt || !['gemini', 'groq'].includes(parsed.provider)) {
    throw new Error('Invalid correction job payload')
  }
  return parsed
}

function decodeJwtPart(value: string) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>
}

/** Verify QStash's signed callback without logging or parsing the body before signature verification. */
export function verifyQStashRequest(signature: string | null, rawBody: string, expectedUrl: string) {
  if (!signature) return false
  const parts = signature.split('.')
  if (parts.length !== 3) return false
  try {
    const header = decodeJwtPart(parts[0])
    const claims = decodeJwtPart(parts[1])
    if (header.alg !== 'HS256' || claims.iss !== 'Upstash' || claims.sub !== expectedUrl) return false
    const now = Math.floor(Date.now() / 1000)
    if (typeof claims.exp !== 'number' || claims.exp < now) return false
    if (typeof claims.nbf === 'number' && claims.nbf > now) return false
    const expectedBodyHash = createHash('sha256').update(rawBody, 'utf8').digest('base64url')
    if (claims.body !== expectedBodyHash) return false

    const signed = Buffer.from(parts[2], 'base64url')
    const signingKeys = [process.env.QSTASH_CURRENT_SIGNING_KEY, process.env.QSTASH_NEXT_SIGNING_KEY].filter(
      (key): key is string => !!key,
    )
    return signingKeys.some((key) => {
      const calculated = createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest()
      return signed.length === calculated.length && timingSafeEqual(signed, calculated)
    })
  } catch {
    return false
  }
}

async function readProviderError(response: Response) {
  const body = await response.json().catch(() => null)
  const message = typeof body?.error?.message === 'string' ? body.error.message : ''
  if (response.status === 401 || response.status === 403) {
    throw new Error('مفتاح الذكاء الاصطناعي مرفوض أو لا يملك صلاحية استخدام الموديل.')
  }
  if (response.status === 429) throw new Error('وصلت لحد الاستخدام لدى مزود الذكاء الاصطناعي. جرّب لاحقًا.')
  if (response.status >= 500) throw new Error('خدمة الذكاء الاصطناعي تواجه مشكلة مؤقتة. جرّب لاحقًا.')
  throw new Error(message.slice(0, 500) || `فشل طلب الذكاء الاصطناعي (HTTP ${response.status}).`)
}

export async function runCorrection(payload: CorrectionPayload) {
  const signal = AbortSignal.timeout(240_000)
  if (payload.provider === 'groq') {
    const messages: Array<Record<string, unknown>> = []
    if (payload.system) messages.push({ role: 'system', content: payload.system })
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: payload.prompt }]
    for (const image of payload.images ?? []) {
      content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } })
    }
    messages.push({ role: 'user', content: payload.images?.length ? content : payload.prompt })
    const jsonInstruction = 'Return exactly one valid JSON object and nothing else. Do not use Markdown fences or commentary.'
    if (payload.json) {
      const index = messages.findIndex((message) => message.role === 'system')
      if (index >= 0) messages[index] = { ...messages[index], content: `${String(messages[index].content)}\n\n${jsonInstruction}` }
      else messages.unshift({ role: 'system', content: jsonInstruction })
    }
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${payload.apiKey.trim().replace(/^['"]|['"]$/g, '')}` },
      body: JSON.stringify({
        model: payload.model,
        messages,
        temperature: payload.temperature ?? 0.2,
        max_completion_tokens: 8192,
      }),
      signal,
      cache: 'no-store',
    })
    if (!response.ok) await readProviderError(response)
    const result = await response.json()
    const contentValue = result?.choices?.[0]?.message?.content
    const output = typeof contentValue === 'string'
      ? contentValue
      : Array.isArray(contentValue)
        ? contentValue.map((part: unknown) => part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text ?? '') : '').join('')
        : ''
    if (!output.trim()) throw new Error('Groq رجّع استجابة من غير نص نهائي. جرّب موديلًا آخر.')
    return output
  }

  const parts: Array<Record<string, unknown>> = [{ text: payload.prompt }]
  for (const image of payload.images ?? []) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } })
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: payload.temperature ?? 0.2,
      ...(payload.json ? { responseMimeType: 'application/json' } : {}),
    },
  }
  if (payload.system) body.systemInstruction = { parts: [{ text: payload.system }] }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(payload.model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': payload.apiKey },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    },
  )
  if (!response.ok) await readProviderError(response)
  const result = await response.json()
  const output = (result?.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? '')
    .join('')
  if (!output.trim()) throw new Error('Gemini رجّع رد فاضي. جرّب مرة أخرى.')
  return output
}
