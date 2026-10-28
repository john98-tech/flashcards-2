'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { db } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type FeedbackMessage = { id: number; thread_id: string; sender_role: 'user' | 'admin'; message: string; page_path: string | null; page_title: string | null; created_at: string }

export async function loadFeedbackMessages(threadId: string): Promise<FeedbackMessage[]> {
  if (!UUID_RE.test(threadId)) return []
  const { data, error } = await db().from('feedback_messages').select('id, thread_id, sender_role, message, page_path, page_title, created_at').eq('thread_id', threadId).order('created_at', { ascending: true }).limit(300)
  if (error) throw new Error('تعذر تحميل المحادثة. حاول مرة أخرى.')
  return (data ?? []) as FeedbackMessage[]
}

export async function sendFeedbackMessage(input: { threadId: string; message: string; pagePath: string; pageTitle: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const threadId = input.threadId
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  const pagePath = typeof input.pagePath === 'string' ? input.pagePath.slice(0, 500) : ''
  const pageTitle = typeof input.pageTitle === 'string' ? input.pageTitle.slice(0, 200) : ''
  if (!UUID_RE.test(threadId)) return { ok: false, error: 'تعذر التعرف على المحادثة. حدّث الصفحة وحاول مرة أخرى.' }
  if (!message || message.length > 2000) return { ok: false, error: 'اكتب رسالة من حرف واحد إلى 2000 حرف.' }
  if (!pagePath.startsWith('/') || pagePath.startsWith('//')) return { ok: false, error: 'تعذر تحديد الصفحة الحالية.' }
  const { error } = await db().from('feedback_messages').insert({ thread_id: threadId, sender_role: 'user', message, page_path: pagePath, page_title: pageTitle || pagePath })
  if (error) return { ok: false, error: 'لم تُرسل الرسالة. تأكد من إعداد قاعدة البيانات وحاول مرة أخرى.' }
  return { ok: true }
}

export async function replyToFeedback(input: { threadId: string; message: string }) {
  await requireAdmin()
  if (!UUID_RE.test(input.threadId)) throw new Error('محادثة غير صحيحة.')
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (!message || message.length > 2000) throw new Error('اكتب ردًا من حرف واحد إلى 2000 حرف.')
  const { error } = await db().from('feedback_messages').insert({ thread_id: input.threadId, sender_role: 'admin', message })
  if (error) throw new Error('تعذر إرسال الرد. تأكد من تشغيل migration الخاصة بالتعليقات.')
  revalidatePath('/admin/feedback')
}
