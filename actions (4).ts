'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/supabase/admin'

export type AuthState = { error: string } | null

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function safeNext(raw: FormDataEntryValue | null) {
  const value = String(raw ?? '/')
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    password: String(formData.get('password') ?? ''),
  }
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData)
  if (!EMAIL_RE.test(email) || !password) return { error: 'Enter your email and password.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.status === 429) return { error: 'Too many attempts. Please wait a minute and try again.' }
    if (error.code === 'email_not_confirmed') return { error: 'This email is not confirmed yet.' }
    if (error.status && error.status >= 500) {
      console.error('[auth] sign-in failed', error.message)
      return { error: 'Something went wrong. Please try again.' }
    }
    return { error: 'Invalid email or password.' }
  }
  await supabase.auth.signOut({ scope: 'others' })
  redirect(safeNext(formData.get('next')))
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData)
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password.length > 72) return { error: 'Password is too long.' }

  const { error: createError } = await db().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError) {
    if (createError.code === 'email_exists' || createError.code === 'user_already_exists') {
      return { error: 'Could not create an account with this email. Try signing in instead.' }
    }
    if (createError.code === 'weak_password') return { error: 'Please choose a stronger password.' }
    console.error('[auth] sign-up failed', createError.message)
    return { error: 'Something went wrong. Please try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Account created. Please sign in.' }
  redirect(safeNext(formData.get('next')))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
