import 'server-only'
import { cache } from 'react'
import { createClient } from './supabase/server'
import { db } from './supabase/admin'

export type Session = { id: string; email: string; isAdmin: boolean; onboardingCompleted: boolean }

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const email = user.email ?? ''
  const adminEmails = (process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const isConfiguredAdmin = !!email && adminEmails.includes(email.toLowerCase())

  const { data } = await db().from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (isConfiguredAdmin && !data?.is_admin) {
    await db().from('profiles').upsert({ id: user.id, email, is_admin: true })
  }
  return {
    id: user.id,
    email,
    isAdmin: isConfiguredAdmin || !!data?.is_admin,
    onboardingCompleted: user.user_metadata?.onboarding_completed === true,
  }
})
