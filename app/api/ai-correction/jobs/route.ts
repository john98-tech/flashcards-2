import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'
import { encryptJobPayload, type CorrectionPayload } from '@/lib/ai-correction-jobs'

export const runtime = 'nodejs'
export const maxDuration = 15

const BUCKET = 'ai-correction-payloads'
const MAX_IMAGES = 20
const MAX_PAYLOAD_CHARS = 3_500_000

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return jsonError('سجّل الدخول أولًا لبدء التصحيح في الخلفية.', 401)

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 4_000_000) {
    return jsonError('حجم صور الإجابة كبير جدًا. قلّل عدد الصفحات أو جرّب تقسيم الإجابة.', 413)
  }

  let body: Partial<CorrectionPayload>
  try {
    body = await request.json()
  } catch {
    return jsonError('بيانات طلب التصحيح غير صالحة.', 400)
  }

  if (
    !body.apiKey || typeof body.apiKey !== 'string' || body.apiKey.length > 512 ||
    !body.model || typeof body.model !== 'string' || body.model.length > 200 ||
    !body.prompt || typeof body.prompt !== 'string' || body.prompt.length > 200_000 ||
    (body.provider !== 'gemini' && body.provider !== 'groq')
  ) {
    return jsonError('بيانات التصحيح ناقصة أو غير صالحة.', 400)
  }

  const images = Array.isArray(body.images) ? body.images : []
  if (images.length > MAX_IMAGES || images.some((image) =>
    !image || typeof image.data !== 'string' || typeof image.mimeType !== 'string' ||
    !/^image\/(jpeg|png|webp)$/i.test(image.mimeType) || image.data.length > 2_000_000
  )) {
    return jsonError('صور الإجابة غير صالحة أو أكبر من الحد المسموح.', 413)
  }
  const imageChars = images.reduce((sum, image) => sum + image.data.length, 0)
  if (imageChars + body.prompt.length > MAX_PAYLOAD_CHARS) {
    return jsonError('حجم إجابة الطالب كبير جدًا لإرسالها بأمان. قلّل عدد الصفحات أو قسّم التصحيح.', 413)
  }

  if (!process.env.QSTASH_TOKEN || !process.env.AI_JOB_WORKER_URL || !process.env.AI_JOB_ENCRYPTION_KEY) {
    return jsonError('إعداد التصحيح في الخلفية غير مكتمل على الاستضافة.', 503)
  }

  const { data: activeJobs, error: activeJobsError } = await db()
    .from('ai_correction_jobs')
    .select('id')
    .eq('owner_id', session.id)
    .in('status', ['queued', 'processing'])
    .limit(1)
  if (activeJobsError) return jsonError('تعذر التحقق من مهام التصحيح الحالية.', 500)
  if (activeJobs?.length) return jsonError('عندك تصحيح شغال بالفعل. ارجع له أو أوقفه قبل بدء تصحيح جديد.', 409)

  const payload: CorrectionPayload = {
    provider: body.provider,
    apiKey: body.apiKey,
    model: body.model,
    prompt: body.prompt,
    ...(typeof body.system === 'string' ? { system: body.system } : {}),
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.1,
    json: body.json === true,
    images: images.map((image) => ({ mimeType: image.mimeType, data: image.data })),
  }

  const jobId = randomUUID()
  const payloadPath = `${session.id}/${jobId}.enc`
  let uploaded = false
  let inserted = false

  try {
    // The API key is encrypted before leaving this request handler. Only ciphertext
    // is stored temporarily; the queue receives the job ID, never the API key.
    const encryptedPayload = encryptJobPayload(payload)
    const upload = await db().storage.from(BUCKET).upload(payloadPath, Buffer.from(encryptedPayload, 'utf8'), {
      contentType: 'text/plain',
      upsert: false,
    })
    if (upload.error) throw new Error('تعذر حفظ مهمة التصحيح المشفّرة.')
    uploaded = true

    const { error: insertError } = await db().from('ai_correction_jobs').insert({
      id: jobId,
      owner_id: session.id,
      status: 'queued',
      payload_path: payloadPath,
    })
    if (insertError) throw new Error('تعذر إنشاء مهمة التصحيح.')
    inserted = true

    const publishUrl = `https://qstash.upstash.io/v2/publish/${process.env.AI_JOB_WORKER_URL}`
    const published = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Forward-Content-Type': 'application/json',
        'Upstash-Retries': '3',
        'Upstash-Timeout': '5m',
        'Upstash-Redact-Fields': 'body',
        'Upstash-Label': 'handwriting-correction',
      },
      body: JSON.stringify({ jobId }),
      cache: 'no-store',
    })
    if (!published.ok) {
      // Do not include the provider key or encrypted payload in any error/log.
      throw new Error('تعذر إرسال مهمة التصحيح إلى خدمة المهام الخلفية.')
    }

    return NextResponse.json({ jobId, status: 'queued' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (uploaded) await db().storage.from(BUCKET).remove([payloadPath]).catch(() => undefined)
    if (inserted) await db().from('ai_correction_jobs').delete().eq('id', jobId).eq('owner_id', session.id)
    const message = error instanceof Error ? error.message : 'تعذر بدء التصحيح في الخلفية.'
    return jsonError(message, 503)
  }
}
