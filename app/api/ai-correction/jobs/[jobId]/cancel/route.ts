import type { NextRequest } from 'next/server'
import { correctionError, forwardToGemini, interactionsUrl, readApiKey } from '@/lib/ai-correction-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const apiKey = readApiKey(request)
  if (!apiKey) return correctionError(400, 'مفتاح Gemini غير موجود.')

  const { jobId } = await context.params
  if (!jobId || jobId.includes('/')) return correctionError(400, 'معرّف مهمة التصحيح غير صالح.')

  return forwardToGemini(interactionsUrl(`/${encodeURIComponent(jobId)}/cancel`), { method: 'POST', apiKey, retries: 1 })
}
