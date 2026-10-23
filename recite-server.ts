import 'server-only'
import { db } from './supabase/admin'

export type ReciteRef = { outline: string; referenceText: string; referenceImage: string | null }
const EMPTY: ReciteRef = { outline: '', referenceText: '', referenceImage: null }

/** Never throws: if the table has not been migrated yet we fall back to the lesson's cards. */
export async function getReciteRef(deckId: string): Promise<ReciteRef> {
  try {
    const { data, error } = await db()
      .from('recite_refs')
      .select('outline, reference_text, reference_image')
      .eq('deck_id', deckId)
      .maybeSingle()
    if (error || !data) return EMPTY
    return { outline: data.outline ?? '', referenceText: data.reference_text ?? '', referenceImage: data.reference_image ?? null }
  } catch {
    return EMPTY
  }
}

export async function getReciteDeckIds(): Promise<Set<string>> {
  try {
    const { data } = await db().from('recite_refs').select('deck_id')
    return new Set((data ?? []).map((r) => r.deck_id as string))
  } catch {
    return new Set()
  }
}
