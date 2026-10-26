import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BookOpen, CalendarDays } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { getSession } from '@/lib/auth'
import { listRecallCourses } from '@/lib/active-recall/data'

export const dynamic = 'force-dynamic'

export default async function ActiveRecallPage() {
  if (!(await getSession())) redirect('/login?next=%2Factive-recall')
  let courses: Awaited<ReturnType<typeof listRecallCourses>> = []
  let loadFailed = false
  try {
    courses = await listRecallCourses()
  } catch (error) {
    console.error('[active-recall] failed to load courses:', error)
    loadFailed = true
  }
  return (
    <div className="min-h-dvh" dir="rtl">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" aria-hidden /> الرئيسية
        </Link>
        <header className="mb-6 rounded-2xl border bg-card p-5 sm:p-7">
          <p className="text-sm font-semibold text-primary">مذاكرة يومية بطريقة الاستدعاء النشط</p>
          <h1 className="mt-1 text-2xl font-bold">المراجعة اليومية</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">اقرأ درس اليوم، وبعدها جاوب على سؤال واحد من غير ما تبص على الإجابة. الدروس بتفتح يومًا بعد يوم.</p>
        </header>

        {loadFailed ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">تعذّر تحميل الدورات حاليًا. حاول مرة أخرى بعد قليل.</p>
        ) : courses.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">لا توجد دورات متاحة حاليًا.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <li key={course.id}>
                <Link href={`/active-recall/${course.id}`} className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <BookOpen className="size-6 text-primary" aria-hidden />
                  <span className="text-lg font-bold">{course.name}</span>
                  <span className="text-sm text-muted-foreground">{course.lessonCount} درس يومي</span>
                  <span className="mt-auto flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4" aria-hidden /> البداية: {new Date(`${course.startDate}T00:00:00Z`).toLocaleDateString('ar-EG', { timeZone: 'UTC' })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
