import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: expired, error } = await db()
    .from('ai_correction_jobs')
    .select('id,payload_path')
    .lt('expires_at', new Date().toISOString())
    .limit(500)

  if (error) return NextResponse.json({ error: 'Unable to load expired jobs.' }, { status: 500 })
  if (!expired?.length) return NextResponse.json({ deleted: 0 })

  const paths = expired.map((job) => job.payload_path).filter((path): path is string => !!path)
  if (paths.length) {
    const { error: storageError } = await db().storage.from('ai-correction-payloads').remove(paths)
    if (storageError) return NextResponse.json({ error: 'Unable to remove expired encrypted payloads.' }, { status: 500 })
  }

  const ids = expired.map((job) => job.id)
  const { error: deleteError } = await db().from('ai_correction_jobs').delete().in('id', ids)
  if (deleteError) return NextResponse.json({ error: 'Unable to delete expired job records.' }, { status: 500 })

  return NextResponse.json({ deleted: ids.length })
}
