import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'
import { plainText } from '@/lib/cloze'
import { getDeckMeta } from '@/lib/decks'
import { canOpen, getAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مسجل الدخول.' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const deckId = searchParams.get('deckId')?.trim()
  const cardId = searchParams.get('cardId')?.trim()
  if (!deckId || !cardId) return NextResponse.json({ error: 'بيانات الكارد غير صحيحة.' }, { status: 400 })
  const [meta, access] = await Promise.all([getDeckMeta(deckId), getAccess()])
  if (!meta || (!canOpen(meta, access) && !session.isAdmin)) return NextResponse.json({ error: 'لا تملك صلاحية الوصول لهذا الديك.' }, { status: 403 })
  const client = db()
  const { data, error } = await client.from('card_audio_assets')
    .select('audio_path,source_hash,timings,status').eq('deck_id', deckId).eq('card_id', cardId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ url: null })
  const { data: card } = await client.from('cards').select('cloze').eq('deck_id', deckId).eq('id', cardId).maybeSingle()
  if (!card) return NextResponse.json({ url: null })
  const text = plainText(card.cloze).split(/\r?\n/)
    .filter(line => !/^\s*>>/.test(line))
    .map(line => line.replace(/^\s*#{1,4}\s*/, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/&/g, 'and').replace(/\|/g, ', ').trimEnd())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const hash = createHash('sha256').update(text).digest('hex')
  if (hash !== data.source_hash) return NextResponse.json({ url: null })
  const { data: signed, error: signedError } = await client.storage.from('card-audio').createSignedUrl(data.audio_path, 60 * 60)
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: 'تعذر تجهيز رابط الصوت.' }, { status: 500 })
  return NextResponse.json({ url: signed.signedUrl, timings: data.timings ?? [], status: data.status ?? 'ready' })
}
