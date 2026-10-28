'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { db } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const BUCKET = 'feedback-attachments'

export type FeedbackMessage = {
  id: number
  thread_id: string
  sender_role: 'user' | 'admin'
  message: string
  page_path: string | null
  page_title: string | null
  created_at: string
  attachment_url?: string | null
  attachment_type?: 'image' | 'audio' | null
  attachment_name?: string | null
}

export async function loadFeedbackMessages(threadId: string): Promise<FeedbackMessage[]> {
  if (!UUID_RE.test(threadId)) return []
  const { data, error } = await db().from('feedback_messages')
    .select('id, thread_id, sender_role, message, page_path, page_title, created_at, attachment_url, attachment_type, attachment_name')
    .eq('thread_id', threadId).order('created_at', { ascending: true }).limit(300)
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

export async function sendFeedbackAttachment(input: {
  threadId: string
  file: File
  kind: 'image' | 'audio'
  message: string
  pagePath: string
  pageTitle: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { threadId, file, kind } = input
  const message = typeof input.message === 'string' ? input.message.trim().slice(0, 2000) : ''
  const pagePath = typeof input.pagePath === 'string' ? input.pagePath.slice(0, 500) : ''
  const pageTitle = typeof input.pageTitle === 'string' ? input.pageTitle.slice(0, 200) : ''
  if (!UUID_RE.test(threadId)) return { ok: false, error: 'تعذر التعرف على المحادثة. حدّث الصفحة وحاول مرة أخرى.' }
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'حجم الملف لازم يكون أكبر من صفر و8 ميجابايت أو أقل.' }
  if (!pagePath.startsWith('/') || pagePath.startsWith('//')) return { ok: false, error: 'تعذر تحديد الصفحة الحالية.' }

  const normalizedMimeType = file.type.split(';')[0].trim().toLowerCase()
  const allowedTypes = kind === 'image'
    ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    : ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/3gpp']
  if (!allowedTypes.includes(normalizedMimeType)) return { ok: false, error: kind === 'image' ? 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو GIF.' : 'صيغة التسجيل الصوتي غير مدعومة على هذا المتصفح.' }

  const extensionByType: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
    'audio/aac': 'aac', 'audio/3gpp': '3gp',
  }
  const extension = extensionByType[normalizedMimeType]
  const storagePath = `${threadId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await db().storage.from(BUCKET).upload(storagePath, file, {
    contentType: normalizedMimeType,
    upsert: false,
    cacheControl: '3600',
  })
  if (uploadError) return { ok: false, error: 'تعذر رفع المرفق. تأكد من تشغيل إعدادات تخزين المرفقات في Supabase.' }

  const { data: publicData } = db().storage.from(BUCKET).getPublicUrl(storagePath)
  const messageText = message || (kind === 'image' ? 'صورة مرفقة' : 'رسالة صوتية')
  const { error: insertError } = await db().from('feedback_messages').insert({
    thread_id: threadId,
    sender_role: 'user',
    message: messageText,
    page_path: pagePath,
    page_title: pageTitle || pagePath,
    attachment_url: publicData.publicUrl,
    attachment_type: kind,
    attachment_name: file.name?.slice(0, 255) || (kind === 'image' ? 'image' : 'voice-message'),
  })
  if (insertError) {
    await db().storage.from(BUCKET).remove([storagePath])
    return { ok: false, error: 'تم رفع الملف لكن تعذر حفظ الرسالة. حاول مرة أخرى.' }
  }
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
