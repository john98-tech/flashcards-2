import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'
import { decryptJobPayload, runCorrection, verifyQStashRequest } from '@/lib/ai-correction-jobs'

export const runtime = 'nodejs'
export const maxDuration = 300

const BUCKET = 'ai-correction-payloads'

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const workerUrl = process.env.AI_JOB_WORKER_URL
  if (!workerUrl || !verifyQStashRequest(request.headers.get('Upstash-Signature'), rawBody, workerUrl)) {
    return jsonError('Invalid task signature.', 401)
  }

  let jobId = ''
  try {
    const parsed = JSON.parse(rawBody) as { jobId?: unknown }
    if (typeof parsed.jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.jobId)) {
      return jsonError('Invalid job ID.', 400)
    }
    jobId = parsed.jobId
  } catch {
    return jsonError('Invalid task body.', 400)
  }

  const { data: job, error: readError } = await db()
    .from('ai_correction_jobs')
    .select('id,status,payload_path,updated_at')
    .eq('id', jobId)
    .maybeSingle()

  if (readError) return jsonError('Unable to load job.', 500)
  if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) return NextResponse.json({ ok: true })
  if (job.status === 'processing') {
    const age = Date.now() - new Date(job.updated_at).getTime()
    if (age < 270_000) return NextResponse.json({ ok: true })
  }
  if (!job.payload_path) return NextResponse.json({ ok: true })

  const claimTime = new Date().toISOString()
  const claimResult = job.status === 'queued'
    ? await db()
        .from('ai_correction_jobs')
        .update({ status: 'processing', updated_at: claimTime })
        .eq('id', jobId)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle()
    : await db()
        .from('ai_correction_jobs')
        .update({ status: 'processing', updated_at: claimTime })
        .eq('id', jobId)
        .eq('status', 'processing')
        .lt('updated_at', new Date(Date.now() - 270_000).toISOString())
        .select('id')
        .maybeSingle()

  if (claimResult.error) return jsonError('Unable to claim job.', 500)
  if (!claimResult.data) return NextResponse.json({ ok: true })

  try {
    const { data: encryptedFile, error: downloadError } = await db().storage.from(BUCKET).download(job.payload_path)
    if (downloadError || !encryptedFile) throw new Error('تعذر استرجاع بيانات مهمة التصحيح المشفّرة.')
    const payload = decryptJobPayload(await encryptedFile.text())
    const raw = await runCorrection(payload)

    // If the student cancelled while the model was working, discard the result.
    await db()
      .from('ai_correction_jobs')
      .update({
        status: 'completed',
        result: { raw },
        error_message: null,
        payload_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'processing')
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'تعذر إكمال التصحيح.'
    await db()
      .from('ai_correction_jobs')
      .update({
        status: 'failed',
        error_message: message,
        payload_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'processing')
  } finally {
    await db().storage.from(BUCKET).remove([job.payload_path]).catch(() => undefined)
  }

  return NextResponse.json({ ok: true })
}
