'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type RedeemState = { ok: boolean; message: string } | null

export async function completeOnboarding() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('Please sign in to save tutorial progress.')
  const { error } = await supabase.auth.updateUser({
    data: { ...user.user_metadata, onboarding_completed: true },
  })
  if (error) throw new Error(error.message)
}

const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function redeemCode(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const session = await getSession()
  if (!session) return { ok: false, message: 'Please sign in first.' }

  const raw = normalizeCode(String(formData.get('code') ?? ''))
  if (raw.length !== 12) return { ok: false, message: 'Invalid or already used code.' }
  const code = raw.match(/.{4}/g)!.join('-')

  const { data: claimed } = await db()
    .from('access_codes')
    .update({
      redeemed_by: session.id,
      redeemed_email: session.email,
      redeemed_at: new Date().toISOString(),
    })
    .eq('code', code)
    .eq('revoked', false)
    .is('redeemed_by', null)
    .is('redeemed_token', null)
    .select('code')

  if (!claimed?.length) {
    const { data: existing } = await db()
      .from('access_codes')
      .select('code')
      .eq('code', code)
      .eq('revoked', false)
      .eq('redeemed_by', session.id)
      .maybeSingle()
    if (!existing) return { ok: false, message: 'Invalid or already used code.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, message: 'Code activated. Your content is unlocked on your account.' }
}
