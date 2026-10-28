import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_REVISION = '2026-05-20'

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const apiKey = request.headers.get('x-goog-api-key')
  if (!apiKey) {
    return NextResponse.json({ error: { message: 'مفتاح Gemini غير موجود.' } }, { status: 400 })
  }

  const { jobId } = await context.params
  if (!jobId || jobId.includes('/')) {
    return NextResponse.json({ error: { message: 'معرّف مهمة التصحيح غير صالح.' } }, { status: 400 })
  }

  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(jobId)}`, {
      headers: { 'x-goog-api-key': apiKey, 'Api-Revision': API_REVISION },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const payload = await upstream.text()
    return new Response(payload, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Gemini correction job polling failed:', error)
    return NextResponse.json({ error: { message: 'تعذر جلب نتيجة التصحيح من Gemini.' } }, { status: 502 })
  }
}
