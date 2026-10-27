'use server'

import { randomInt, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getDeck } from '@/lib/decks'
import { db } from '@/lib/supabase/admin'
import type { Card, Deck } from '@/lib/cloze'

const DECK_ID_RE = /^[a-z0-9-]+$/

export async function loadDeck(id: string): Promise<Deck | null> {
  await requireAdmin()
  return getDeck(id)
}

export async function saveDeckMeta(meta: Omit<Deck, 'cards'>) {
  await requireAdmin()
  if (!DECK_ID_RE.test(meta.id)) throw new Error('Deck ID must use lowercase English letters, numbers, and dashes.')
  const { error } = await db().from('decks').upsert({
    id: meta.id,
    group_id: meta.groupId,
    title: meta.title.slice(0, 200),
    subject: meta.subject.slice(0, 100),
    description: meta.description.slice(0, 500),
    is_free: meta.isFree,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function moveDeckToGroup(deckId: string, groupId: string) {
  await requireAdmin()
  if (!DECK_ID_RE.test(deckId) || !groupId) throw new Error('Invalid deck or group.')

  const { data: group, error: groupError } = await db()
    .from('deck_groups')
    .select('id')
    .eq('id', groupId)
    .maybeSingle()
  if (groupError) throw new Error(groupError.message)
  if (!group) throw new Error('Choose a valid group.')

  const { data: deck, error } = await db()
    .from('decks')
    .update({ group_id: groupId, updated_at: new Date().toISOString() })
    .eq('id', deckId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!deck) throw new Error('Deck not found.')
  revalidatePath('/', 'layout')
}

export async function createDeckGroup(name: string) {
  await requireAdmin()
  const normalizedName = name.trim()
  if (!normalizedName || normalizedName.length > 120) throw new Error('Group names must be between 1 and 120 characters.')
  const group = { id: randomUUID(), name: normalizedName }
  const { data, error } = await db().from('deck_groups').insert(group).select('id, name').single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteDeckGroup(id: string) {
  await requireAdmin()
  if (!id || id === 'ungrouped') throw new Error('لا يمكن حذف المجموعة الافتراضية.')
  const client = db()
  const { data: group, error: readError } = await client.from('deck_groups').select('*').eq('id', id).maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!group) return
  const { count, error: countError } = await client.from('decks').select('id', { count: 'exact', head: true }).eq('group_id', id)
  if (countError) throw new Error(countError.message)
  if (count) throw new Error('انقل الدروس من المجموعة أولًا قبل حذفها.')
  const { error: binError } = await client.from('recycle_bin').insert({ entity_type: 'deck_group', entity_id: id, payload: group })
  if (binError) throw new Error(binError.message)
  const { error } = await client.from('deck_groups').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

export async function saveCard(deckId: string, card: Card, position: number) {
  await requireAdmin()
  if (!DECK_ID_RE.test(deckId) || !card.id || card.id.length > 64) throw new Error('Invalid card.')
  const { error } = await db().from('cards').upsert({
    deck_id: deckId,
    id: card.id,
    position,
    cloze: card.cloze.slice(0, 10000),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function deleteCards(deckId: string, ids: string[]) {
  await requireAdmin()
  if (!ids.length) return
  const client = db()
  const { data: cards, error: readError } = await client.from('cards').select('*').eq('deck_id', deckId).in('id', ids)
  if (readError) throw new Error(readError.message)
  if (!cards?.length) return
  const { error: binError } = await client.from('recycle_bin').insert(cards.map(card => ({
    entity_type: 'card', entity_id: `${deckId}:${card.id}`, payload: card,
  })))
  if (binError) throw new Error(binError.message)
  const { error } = await client.from('cards').delete().eq('deck_id', deckId).in('id', ids)
  if (error) throw new Error(error.message)
}

export async function finishDeckSave() {
  await requireAdmin()
  revalidatePath('/', 'layout')
}

export async function deleteDeck(id: string) {
  await requireAdmin()
  const client = db()
  const { data: deck, error: deckError } = await client.from('decks').select('*').eq('id', id).maybeSingle()
  if (deckError) throw new Error(deckError.message)
  if (!deck) return
  const { data: cards, error: cardsError } = await client.from('cards').select('*').eq('deck_id', id)
  if (cardsError) throw new Error(cardsError.message)
  const { error: binError } = await client.from('recycle_bin').insert([
    { entity_type: 'deck', entity_id: id, payload: { deck, cards: cards ?? [] } },
  ])
  if (binError) throw new Error(binError.message)
  const { error } = await client.from('decks').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

export type RecycleBinItem = { id: string; entityType: string; entityId: string; payload: Record<string, unknown>; deletedAt: string }

export async function listRecycleBin(): Promise<RecycleBinItem[]> {
  await requireAdmin()
  const { data, error } = await db().from('recycle_bin').select('id, entity_type, entity_id, payload, deleted_at').order('deleted_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []).map(item => ({ id: item.id, entityType: item.entity_type, entityId: item.entity_id, payload: item.payload, deletedAt: item.deleted_at }))
}

export async function restoreRecycleBinItem(id: string) {
  await requireAdmin()
  const client = db()
  const { data: item, error: readError } = await client.from('recycle_bin').select('*').eq('id', id).maybeSingle()
  if (readError) throw new Error(readError.message)
  if (!item) throw new Error('العنصر غير موجود في سلة المحذوفات.')
  if (item.entity_type === 'deck') {
    const payload = item.payload as { deck: Record<string, unknown>; cards: Record<string, unknown>[] }
    const { error: deckError } = await client.from('decks').upsert(payload.deck)
    if (deckError) throw new Error(deckError.message)
    if (payload.cards?.length) {
      const { error: cardsError } = await client.from('cards').upsert(payload.cards)
      if (cardsError) throw new Error(cardsError.message)
    }
  } else if (item.entity_type === 'card') {
    const { error } = await client.from('cards').upsert(item.payload)
    if (error) throw new Error(error.message)
  } else if (item.entity_type === 'deck_group') {
    const { error } = await client.from('deck_groups').upsert(item.payload)
    if (error) throw new Error(error.message)
  } else {
    throw new Error('نوع العنصر غير مدعوم للاستعادة.')
  }
  const { error } = await client.from('recycle_bin').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

export async function permanentlyDeleteRecycleBinItem(id: string) {
  await requireAdmin()
  const { error } = await db().from('recycle_bin').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

export type AccessCode = {
  code: string
  label: string
  allPaid: boolean
  deckIds: string[]
  redeemedAt: string | null
  revoked: boolean
  createdAt: string
}

export async function listCodes(): Promise<AccessCode[]> {
  await requireAdmin()
  const { data, error } = await db()
    .from('access_codes')
    .select('code, label, all_paid, deck_ids, redeemed_at, revoked, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw new Error(error.message)
  return data.map((r) => ({
    code: r.code,
    label: r.label,
    allPaid: r.all_paid,
    deckIds: r.deck_ids,
    redeemedAt: r.redeemed_at,
    revoked: r.revoked,
    createdAt: r.created_at,
  }))
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function newCode() {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)])
  return chars.join('').match(/.{4}/g)!.join('-')
}

export async function generateCodes(input: { count: number; label: string; allPaid: boolean; deckIds: string[] }) {
  await requireAdmin()
  const count = Math.floor(input.count)
  if (!Number.isFinite(count) || count < 1 || count > 200) throw new Error('Choose between 1 and 200 codes.')
  const deckIds = input.allPaid ? [] : input.deckIds.filter((id) => DECK_ID_RE.test(id))
  if (!input.allPaid && !deckIds.length) throw new Error('Pick at least one deck for these codes to unlock.')

  const rows = Array.from({ length: count }, () => ({
    code: newCode(),
    label: input.label.slice(0, 120),
    all_paid: input.allPaid,
    deck_ids: deckIds,
  }))
  const { error } = await db().from('access_codes').insert(rows)
  if (error) throw new Error(error.message)
  return rows.map((r) => r.code)
}

export async function setCodeRevoked(code: string, revoked: boolean) {
  await requireAdmin()
  const { error } = await db().from('access_codes').update({ revoked }).eq('code', code)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

export async function deleteCode(code: string) {
  await requireAdmin()
  const { error } = await db().from('access_codes').delete().eq('code', code)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}
