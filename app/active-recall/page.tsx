import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BookOpen } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { getSession } from '@/lib/auth'
import { cairoDate, getRecallCatalog } from '@/lib/active-recall/data'
import { RecallTestDatePicker } from '@/components/active-recall/test-date-picker'

export const dynamic = 'force-dynamic'

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export default async function ActiveRecallPage({ searchParams }: { searchParams: Promise<{ testDate?: string | string[] }> }) {
  if (!(await getSession())) redirect('/login?next=%2Factive-recall')
  const query = await searchParams
  const actualToday = cairoDate()
  const requestedDate = Array.isArray(query.testDate) ? query.testDate[0] : query.testDate
  const selectedDate = requestedDate && isValidDate(requestedDate) ? requestedDate : actualToday
  let courses: Awaited<ReturnType<typeof getRecallCatalog>>['courses'] = []
  let loadFailed = false
  try {
    const catalog = await getRecallCatalog()
    courses = catalog.courses
  } catch (error) {
    console.error('[active-recall] failed to load course catalog:', error)
    loadFailed = true
  }
  return (
    <div className="min-h-dvh" dir="rtl">
      <SiteHeader />
      <div className="pt-4"><RecallTestDatePicker actualToday={actualToday} selectedDate={selectedDate} /></div>\n      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" aria-hidden /> الرئيسية
        </Link>
        <header className="mb-6 rounded-2xl border bg-card p-5 sm:p-7">
          <p className="text-sm font-semibold text-primary">مذاكرة يومية بطريقة الاستدعاء النشط</p>
          <h1 className="mt-1 text-2xl font-bold">المراجعة اليومية</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">اختار الدروس اللي ذاكرتها بالفعل وحدد وقت المراجعة. هنوزّع تكرارها على الأيام، وتقدر تعدّل خطتك في أي وقت.</p>
        </header>

        {loadFailed ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">تعذّر تحميل المناهج حاليًا. تأكد من تحديث قاعدة البيانات ثم حاول مرة أخرى.</p>
        ) : courses.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">لا توجد دورات متاحة حاليًا.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <li key={course.id}>
                <Link href={selectedDate !== actualToday ? `/active-recall/${course.id}?testDate=${selectedDate}` : `/active-recall/${course.id}`} className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <BookOpen className="size-6 text-primary" aria-hidden />
                  <span className="text-lg font-bold">{course.name}</span>
                  <span className="text-sm text-muted-foreground">{course.lessonCount} درس متاح للاختيار</span>
                  <span className="mt-auto text-xs font-semibold text-primary">اختيار الدروس وإنشاء الخطة ←</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
