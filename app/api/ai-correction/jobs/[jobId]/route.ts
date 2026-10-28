import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
const BUCKET = 'ai-correction-payloads'

type RouteContext = { params: Promise<{ jobId: string }> }

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession()
  if (!session) return jsonError('سجّل الدخول لعرض نتيجة التصحيح.', 401)
  const { jobId } = await context.params

  const { data, error } = await db()
    .from('ai_correction_jobs')
    .select('id,status,result,error_message,created_at,updated_at')
    .eq('id', jobId)
    .eq('owner_id', session.id)
    .maybeSingle()

  if (error) return jsonError('تعذر قراءة حالة التصحيح.', 500)
  if (!data) return jsonError('مهمة التصحيح غير موجودة.', 404)

  return NextResponse.json({
    jobId: data.id,
    status: data.status,
    result: data.result,
    error: data.error_message,
    updatedAt: data.updated_at,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession()
  if (!session) return jsonError('سجّل الدخول لإيقاف التصحيح.', 401)
  const { jobId } = await context.params

  const { data, error } = await db()
    .from('ai_correction_jobs')
    .select('status,payload_path')
    .eq('id', jobId)
    .eq('owner_id', session.id)
    .maybeSingle()

  if (error) return jsonError('تعذر إيقاف التصحيح.', 500)
  if (!data) return jsonError('مهمة التصحيح غير موجودة.', 404)
  if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
    return NextResponse.json({ status: data.status }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { error: updateError } = await db()
    .from('ai_correction_jobs')
    .update({ status: 'cancelled', payload_path: null, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('owner_id', session.id)
    .in('status', ['queued', 'processing'])

  if (updateError) return jsonError('تعذر إيقاف التصحيح.', 500)
  if (data.payload_path) await db().storage.from(BUCKET).remove([data.payload_path])
  return NextResponse.json({ status: 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } })
}
