import 'server-only'
import { db } from './supabase/admin'
import { getSession } from './auth'

export type Access = { allPaid: boolean; deckIds: Set<string> }

export async function getAccess(): Promise<Access> {
  const session = await getSession()
  const access: Access = { allPaid: false, deckIds: new Set() }
  if (!session) return access
  if (session.isAdmin) {
    access.allPaid = true
    return access
  }

  const { data } = await db()
    .from('access_codes')
    .select('all_paid, deck_ids')
    .eq('redeemed_by', session.id)
    .eq('revoked', false)
  for (const row of data ?? []) {
    if (row.all_paid) access.allPaid = true
    for (const id of row.deck_ids as string[]) access.deckIds.add(id)
  }
  return access
}

export function canOpen(deck: { id: string; isFree: boolean }, access: Access) {
  return deck.isFree || access.allPaid || access.deckIds.has(deck.id)
}
