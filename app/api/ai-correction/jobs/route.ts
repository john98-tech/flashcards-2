import type { NextRequest } from 'next/server'
import { correctionError, forwardToGemini, interactionsUrl, readApiKey } from '@/lib/ai-correction-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const apiKey = readApiKey(request)
  if (!apiKey) return correctionError(400, 'مفتاح Gemini غير موجود.')
  const body = await request.text()
  // No automatic retry here: re-sending a create request could start the job twice.
  return forwardToGemini(interactionsUrl(), { method: 'POST', apiKey, body, timeoutMs: 45000 })
}
