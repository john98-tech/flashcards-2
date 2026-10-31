import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { AdminTabs } from '@/components/admin/admin-tabs'
import { isAdmin } from '@/lib/admin-auth'
import { getDeckGroups, getDeckSummaries } from '@/lib/decks'

export const metadata: Metadata = {
  title: 'Admin panel | Sammaa',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  if (!(await isAdmin())) notFound()
  const [decks, groups] = await Promise.all([getDeckSummaries(), getDeckGroups()])

  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <span className="text-sm text-muted-foreground">Admin panel</span>
      </SiteHeader>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div><h2 className="font-bold">تعليقات واقتراحات المستخدمين</h2><p className="mt-1 text-sm text-muted-foreground">اقرأ الرسائل واعرف الصفحة المقصودة ورد على المستخدم في نفس المحادثة.</p></div>
          <Link href="/admin/feedback" className="ux-btn inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-bold">فتح صندوق التعليقات</Link>
        </div>
        <AdminTabs decks={decks} groups={groups} />
      </main>
    </div>
  )
}
