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
  const { error } = await db().from('cards').delete().eq('deck_id', deckId).in('id', ids)
  if (error) throw new Error(error.message)
}

export async function finishDeckSave() {
  await requireAdmin()
  revalidatePath('/', 'layout')
}

export async function deleteDeck(id: string) {
  await requireAdmin()
  const { error } = await db().from('decks').delete().eq('id', id)
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
