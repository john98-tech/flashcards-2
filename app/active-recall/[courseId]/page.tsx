import { notFound, redirect } from 'next/navigation'
import { RecallCourse } from '@/components/active-recall/recall-course'
import { SiteHeader } from '@/components/site-header'
import { getSession } from '@/lib/auth'
import { cairoDate, getRecallSettings, getStudentRecallCourse } from '@/lib/active-recall/data'

export const dynamic = 'force-dynamic'

export default async function ActiveRecallCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const session = await getSession()
  if (!session) redirect(`/login?next=${encodeURIComponent(`/active-recall/${courseId}`)}`)
  const loaded = await Promise.all([
    getStudentRecallCourse(courseId, session.id),
    getRecallSettings(),
  ]).catch((error) => {
    console.error('[active-recall] failed to load course plan:', error)
    return null
  })
  if (!loaded) {
    return (
      <div className="min-h-dvh" dir="rtl">
        <SiteHeader />
        <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
          <p className="rounded-xl border border-dashed p-10 text-sm text-muted-foreground">تعذّر تحميل الخطة حاليًا. تأكد من تحديث قاعدة البيانات ثم حاول مرة أخرى.</p>
        </main>
      </div>
    )
  }
  const [course, settings] = loaded
  if (!course) notFound()
  return <RecallCourse course={course} today={cairoDate()} settings={settings} />
}
