import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { FeedbackInbox } from '@/components/admin/feedback-inbox'
import type { FeedbackMessage } from '@/app/feedback/actions'
import { isAdmin } from '@/lib/admin-auth'
import { db } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: 'تعليقات المستخدمين | لوحة الإدارة',
  robots: { index: false, follow: false },
}

export default async function AdminFeedbackPage() {
  if (!(await isAdmin())) notFound()
  let messages: FeedbackMessage[] = []
  let loadError = ''
  try {
    const { data, error } = await db()
      .from('feedback_messages')
      .select('id, thread_id, sender_role, message, page_path, page_title, created_at')
      .order('created_at', { ascending: true })
      .limit(3000)
    if (error) throw error
    messages = (data ?? []) as FeedbackMessage[]
  } catch {
    loadError = 'لازم تنفّذ ملف supabase/migrations/20261028000000_feedback_messages.sql في Supabase SQL Editor مرة واحدة، وبعدها ارجع للصفحة.'
  }

  return <div className="min-h-dvh">
    <SiteHeader><span className="text-sm text-muted-foreground">تعليقات المستخدمين</span></SiteHeader>
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">صندوق تعليقات المستخدمين</h1><p className="mt-2 text-sm text-muted-foreground">كل محادثة محفوظة، ومع كل تعليق رابط الصفحة اللي المستخدم كتب منها.</p></div>
        <Link href="/admin" className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">العودة للإدارة</Link>
      </div>
      {loadError ? <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950">{loadError}</div> : <FeedbackInbox initialMessages={messages} />}
    </main>
  </div>
}
