'use server'

import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'

export type ContactState = {
  ok: boolean
  message: string
  errors?: Partial<Record<'name' | 'email' | 'subject' | 'message', string>>
} | null

const SUBJECTS = ['General question', 'Technical problem', 'Access code or billing', 'Content feedback', 'Privacy or legal', 'Other']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  // Honeypot: real visitors never see or fill this field.
  if (String(formData.get('website') ?? '').trim()) return { ok: true, message: 'Thanks! Your message has been sent.' }

  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const subject = String(formData.get('subject') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()

  const errors: NonNullable<ContactState>['errors'] = {}
  if (name.length < 2 || name.length > 100) errors.name = 'Please enter your name.'
  if (!EMAIL_RE.test(email) || email.length > 200) errors.email = 'Please enter a valid email address.'
  if (!SUBJECTS.includes(subject)) errors.subject = 'Please choose a subject.'
  if (message.length < 10) errors.message = 'Please write at least 10 characters.'
  if (message.length > 3000) errors.message = 'Please keep your message under 3,000 characters.'
  if (Object.keys(errors).length) return { ok: false, message: 'Please fix the highlighted fields.', errors }

  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await db()
      .from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', since)
    if ((count ?? 0) >= 3) {
      return { ok: false, message: 'You have sent several messages recently. Please wait a little before sending another.' }
    }

    const session = await getSession()
    const { error } = await db()
      .from('contact_messages')
      .insert({ name, email, subject, message, user_id: session?.id ?? null })
    if (error) throw error
  } catch {
    return {
      ok: false,
      message: 'Sorry, we could not send your message right now. Please try again in a few minutes.',
    }
  }

  return { ok: true, message: 'Thanks! Your message has been sent. We will get back to you by email.' }
}
