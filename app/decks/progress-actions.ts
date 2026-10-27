'use server'

import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'

export type SavedDeckProgress = {
  known?: string[]
  queue?: string[]
  position?: number
  mode?: 'tap' | 'type'
  baseQueue?: string[] | null
  revealed?: number[]
  answers?: Record<number, string>
}

export async function loadStudentDeckProgress(deckId: string): Promise<SavedDeckProgress | null> {
  const session = await getSession()
  if (!session || !/^[a-z0-9-]{1,100}$/.test(deckId)) return null
  const { data, error } = await db()
    .from('student_deck_progress')
    .select('progress')
    .eq('user_id', session.id)
    .eq('deck_id', deckId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.progress as SavedDeckProgress | undefined) ?? null
}

export async function saveStudentDeckProgress(deckId: string, progress: SavedDeckProgress) {
  const session = await getSession()
  if (!session) return
  if (!/^[a-z0-9-]{1,100}$/.test(deckId)) throw new Error('Invalid deck.')
  const known = Array.isArray(progress.known) ? progress.known.filter((id) => typeof id === 'string').slice(0, 5000) : []
  const queue = Array.isArray(progress.queue) ? progress.queue.filter((id) => typeof id === 'string').slice(0, 5000) : []
  const position = Number.isInteger(progress.position) ? Math.max(0, Math.min(progress.position!, 5000)) : 0
  const mode = progress.mode === 'type' ? 'type' : 'tap'
  const baseQueue = Array.isArray(progress.baseQueue) ? progress.baseQueue.filter((id) => typeof id === 'string').slice(0, 5000) : null
  const { error } = await db().from('student_deck_progress').upsert({
    user_id: session.id,
    deck_id: deckId,
    progress: { known, queue, position, mode, baseQueue, revealed, answers },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,deck_id' })
  if (error) throw new Error(error.message)
}
