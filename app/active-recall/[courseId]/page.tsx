import { notFound, redirect } from 'next/navigation'
import { RecallCourse } from '@/components/active-recall/recall-course'
import { RecallTestDatePicker } from '@/components/active-recall/test-date-picker'
import { SiteHeader } from '@/components/site-header'
import { getSession } from '@/lib/auth'
import { cairoDate, getRecallSettings, getStudentRecallCourse } from '@/lib/active-recall/data'

export const dynamic = 'force-dynamic'

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export default async function ActiveRecallCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ testDate?: string | string[]; testTime?: string | string[] }>
}) {
  const { courseId } = await params
  const query = await searchParams
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
  const actualToday = cairoDate()
  const actualTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
  const requestedDate = Array.isArray(query.testDate) ? query.testDate[0] : query.testDate
  const today = requestedDate && isValidDate(requestedDate) ? requestedDate : actualToday
  const requestedTime = Array.isArray(query.testTime) ? query.testTime[0] : query.testTime
  const selectedTime = requestedTime && /^([01]\\d|2[0-3]):[0-5]\\d$/.test(requestedTime) ? requestedTime : actualTime
  const testMode = today !== actualToday || selectedTime !== actualTime
  return (
    <>
      <SiteHeader />
      <div className="pt-4">
        <RecallTestDatePicker actualToday={actualToday} selectedDate={today} actualTime={actualTime} selectedTime={selectedTime} />
        <RecallCourse course={course} today={today} settings={settings} testMode={testMode} />
      </div>
    </>
  )
}
