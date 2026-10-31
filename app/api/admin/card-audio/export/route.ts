import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const deckId = searchParams.get('deckId')?.trim()
  const cardId = searchParams.get('cardId')?.trim()

  if (!deckId || !cardId || deckId.length > 160 || cardId.length > 160) {
    return NextResponse.json({ error: 'بيانات الكارد غير صحيحة.' }, { status: 400 })
  }

  const client = db()
  const { data: asset, error } = await client
    .from('card_audio_assets')
    .select('audio_path,mime_type,source_hash,status')
    .eq('deck_id', deckId)
    .eq('card_id', cardId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!asset?.audio_path) {
    return NextResponse.json({ error: 'ملف الصوت غير موجود لهذا الكارت.' }, { status: 404 })
  }

  const { data, error: signError } = await client.storage
    .from('card-audio')
    .createSignedUrl(asset.audio_path, 5 * 60, { download: false })

  if (signError || !data?.signedUrl) {
    return NextResponse.json({ error: signError?.message || 'تعذر إنشاء رابط تنزيل مؤقت.' }, { status: 500 })
  }

  return NextResponse.json({
    url: data.signedUrl,
    expiresInSeconds: 5 * 60,
    mimeType: asset.mime_type || 'audio/wav',
    sourceHash: asset.source_hash,
    status: asset.status,
  }, {
    headers: {
      'Cache-Control': 'no-store, private',
      'Pragma': 'no-cache',
    },
  })
}
