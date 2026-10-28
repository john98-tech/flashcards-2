import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const API_REVISION = '2026-05-20'

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-goog-api-key')
  if (!apiKey) {
    return NextResponse.json({ error: { message: 'مفتاح Gemini غير موجود.' } }, { status: 400 })
  }

  try {
    const body = await request.text()
    const upstream = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Api-Revision': API_REVISION,
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const payload = await upstream.text()
    return new Response(payload, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Gemini correction job creation failed:', error)
    return NextResponse.json({ error: { message: 'تعذر الاتصال بخدمة التصحيح. حاول مرة أخرى.' } }, { status: 502 })
  }
}
