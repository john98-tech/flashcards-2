import { NextResponse } from 'next/server'

/**
 * Same-origin proxy helpers for Gemini Interactions (background correction jobs).
 * The browser cannot call this API directly: the required `Api-Revision` header
 * fails the CORS preflight. Every response from here is either Google's own
 * success payload or a JSON error shaped `{ error: { message, status, source } }`
 * so the client always knows which layer failed.
 */
const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const API_REVISION = '2026-05-20'

export const interactionsUrl = (path = '') => `${INTERACTIONS_URL}${path}`

export function readApiKey(request: Request) {
  return request.headers.get('x-goog-api-key')?.trim() || null
}

export function correctionError(status: number, message: string, source: 'proxy' | 'google' = 'proxy') {
  return NextResponse.json({ error: { message, status, source } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function toClientResponse(upstream: Response) {
  const text = await upstream.text()
  if (upstream.ok) {
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' },
    })
  }
  let message = ''
  try {
    const json = JSON.parse(text) as { error?: { message?: unknown } }
    if (typeof json?.error?.message === 'string') message = json.error.message
  } catch {
    message = text.slice(0, 300)
  }
  return correctionError(upstream.status, message, 'google')
}

export async function forwardToGemini(
  url: string,
  opts: { method: 'GET' | 'POST'; apiKey: string; body?: string; retries?: number; timeoutMs?: number },
) {
  const attempts = (opts.retries ?? 0) + 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const last = attempt === attempts - 1
    try {
      const upstream = await fetch(url, {
        method: opts.method,
        headers: {
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          'x-goog-api-key': opts.apiKey,
          'Api-Revision': API_REVISION,
        },
        body: opts.body,
        cache: 'no-store',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
      })
      if (upstream.status >= 500 && !last) {
        await sleep(400 * (attempt + 1))
        continue
      }
      return await toClientResponse(upstream)
    } catch (error) {
      if (last) console.error('Gemini correction proxy failed:', error)
      else await sleep(400 * (attempt + 1))
    }
  }
  return correctionError(502, 'السيرفر معرفش يوصل لخدمة Gemini. حاول مرة أخرى.')
}
