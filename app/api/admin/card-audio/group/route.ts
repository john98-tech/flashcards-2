import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })

  const body = await request.json().catch(() => null) as { groupId?: string } | null
  const groupId = body?.groupId?.trim()
  if (!groupId || groupId.length > 160) {
    return NextResponse.json({ error: 'معرّف الجروب غير صحيح.' }, { status: 400 })
  }

  const client = db()
  const { data: decks, error: decksError } = await client
    .from('decks')
    .select('id,title')
    .eq('group_id', groupId)
    .order('created_at')
  if (decksError) return NextResponse.json({ error: decksError.message }, { status: 500 })
  if (!decks?.length) return NextResponse.json({ error: 'الجروب لا يحتوي على ديكس.' }, { status: 404 })

  const items: { deckId: string; deckTitle: string; cardId: string }[] = []
  for (const deck of decks) {
    const { data: cards, error } = await client
      .from('cards')
      .select('id')
      .eq('deck_id', deck.id)
      .order('position')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const card of cards ?? []) {
      items.push({ deckId: deck.id, deckTitle: deck.title, cardId: card.id })
    }
  }

  if (!items.length) return NextResponse.json({ error: 'الجروب لا يحتوي على كروت.' }, { status: 404 })
  return NextResponse.json({ items, total: items.length, deckCount: decks.length })
}
