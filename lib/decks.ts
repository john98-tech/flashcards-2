import 'server-only'
import { db } from './supabase/admin'
import { countBlanks, parseCloze, type Deck } from './cloze'

export type DeckGroup = { id: string; name: string }
export type DeckSummary = Omit<Deck, 'cards'> & { groupName: string; cardCount: number; blankCount: number }

type DeckRow = { id: string; group_id: string; title: string; subject: string; description: string; is_free: boolean }

const toDeckMeta = (row: DeckRow): Omit<Deck, 'cards'> => ({
  id: row.id,
  groupId: row.group_id,
  title: row.title,
  subject: row.subject,
  description: row.description,
  isFree: row.is_free,
})

export async function getDeckGroups(): Promise<DeckGroup[]> {
  const { data, error } = await db().from('deck_groups').select('id, name').order('name')
  if (error) throw error
  return data
}

export async function getDeckSummaries(): Promise<DeckSummary[]> {
  const [decks, cards, groups] = await Promise.all([
    db().from('decks').select('id, group_id, title, subject, description, is_free').order('created_at'),
    db().from('cards').select('deck_id, cloze'),
    db().from('deck_groups').select('id, name'),
  ])
  if (decks.error) throw decks.error
  if (cards.error) throw cards.error
  if (groups.error) throw groups.error

  const stats = new Map<string, { cards: number; blanks: number }>()
  const physiologyDeckIds = new Set(
    (decks.data as DeckRow[]).filter((deck) => deck.group_id === 'physiology').map((deck) => deck.id),
  )
  const groupNames = new Map(groups.data.map((group) => [group.id, group.name]))
  for (const card of cards.data) {
    const s = stats.get(card.deck_id) ?? { cards: 0, blanks: 0 }
    s.cards++
    // Physiology cards reveal each word inside a multiword cloze separately,
    // so the student-facing blank total must count those individual blanks.
    s.blanks += physiologyDeckIds.has(card.deck_id)
      ? parseCloze(card.cloze).filter((segment) => segment.type === 'blank').length
      : countBlanks(card.cloze)
    stats.set(card.deck_id, s)
  }

  return (decks.data as DeckRow[]).map((row) => ({
    ...toDeckMeta(row),
    groupName: groupNames.get(row.group_id) ?? 'Ungrouped',
    cardCount: stats.get(row.id)?.cards ?? 0,
    blankCount: stats.get(row.id)?.blanks ?? 0,
  }))
}

export async function getDeckMeta(id: string) {
  const { data, error } = await db()
    .from('decks')
    .select('id, group_id, title, subject, description, is_free')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toDeckMeta(data as DeckRow) : null
}

export async function getDeck(id: string): Promise<Deck | null> {
  const meta = await getDeckMeta(id)
  if (!meta) return null
  const { data, error } = await db()
    .from('cards')
    .select('id, cloze')
    .eq('deck_id', id)
    .order('position')
  if (error) throw error
  return { ...meta, cards: data }
}
