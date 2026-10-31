import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'
import { plainText } from '@/lib/cloze'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })

  const body = await request.json().catch(() => null) as { groupId?: string; model?: string } | null
  const groupId = body?.groupId?.trim()
  const requestedModel = body?.model || 'gemini-3.8-live'
  const allowedModels = new Set(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-native-audio-preview-12-2025', 'gemini-3.8-live', 'gemini-3.8-live-extended-thinking'])
  const model = allowedModels.has(requestedModel) ? requestedModel : 'gemini-3.8-live'
  const isLiveModel = model === 'gemini-2.5-flash-native-audio-preview-12-2025' || model === 'gemini-3.8-live' || model === 'gemini-3.8-live-extended-thinking'
  const assetModel = isLiveModel ? `${model}:live-audio-test-v1` : `${model}:ar-en-v4-clear-words`
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
  const validHashes = new Map<string, string>()
  for (const deck of decks) {
    const { data: cards, error } = await client
      .from('cards')
      .select('id,cloze')
      .eq('deck_id', deck.id)
      .order('position')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const card of cards ?? []) {
      const spoken = plainText(card.cloze)
        .split(/\r?\n/)
        .filter((line: string) => !/^\s*>>/.test(line))
        .map((line: string) => line.replace(/^\s*#{1,4}\s*/, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/&/g, 'and').replace(/\|/g, ', ').trimEnd())
        .join('\n').replace(/\n{3,}/g, '\n\n').trim()
      const sourceHash = createHash('sha256').update(spoken).digest('hex')
      validHashes.set(deck.id + ':' + card.id, sourceHash)
      items.push({ deckId: deck.id, deckTitle: deck.title, cardId: card.id })
    }
  }

  if (!items.length) return NextResponse.json({ error: 'الجروب لا يحتوي على كروت.' }, { status: 404 })

  // Only skip audio that still matches the card's current spoken text and selected model.
  const { data: assets, error: assetsError } = await client
    .from('card_audio_assets')
    .select('deck_id,card_id,source_hash,model')
    .in('deck_id', decks.map((item: { id: string }) => item.id))
  if (assetsError) return NextResponse.json({ error: assetsError.message }, { status: 500 })
  const completedIds = (assets ?? [])
    .filter((asset: { deck_id: string; card_id: string; source_hash: string; model: string }) =>
      asset.model === assetModel &&
      validHashes.get(asset.deck_id + ':' + asset.card_id) === asset.source_hash
    )
    .map((asset: { deck_id: string; card_id: string }) => asset.deck_id + ':' + asset.card_id)

  return NextResponse.json({ items, total: items.length, deckCount: decks.length, completedIds })
}
