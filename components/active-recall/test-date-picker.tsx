'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function RecallTestDatePicker({ actualToday, selectedDate }: { actualToday: string; selectedDate: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isSimulating = selectedDate !== actualToday

  function changeDate(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== actualToday) params.set('testDate', value)
    else params.delete('testDate')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <section className="mx-auto mb-4 w-full max-w-5xl px-3 sm:px-4">
      <div className={`rounded-xl border p-4 ${isSimulating ? 'border-amber-500/60 bg-amber-500/10' : 'bg-card'}`} dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">أداة اختبار تاريخ المراجعة</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              غيّر التاريخ لمعاينة الجلسات والدروس المستحقة في ذلك اليوم. التاريخ تجريبي للعرض فقط؛ لا تحفظ خطة أو تُنهِ جلسة أثناء الاختبار.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
            اليوم التجريبي
            <input
              aria-label="اختيار اليوم التجريبي للمراجعة اليومية"
              type="date"
              value={selectedDate}
              onChange={(event) => changeDate(event.target.value)}
              className="rounded-lg border bg-background px-3 py-2"
            />
          </label>
          {isSimulating && (
            <button type="button" onClick={() => changeDate(actualToday)} className="rounded-lg border px-3 py-2 text-sm font-semibold">
              الرجوع لليوم الحقيقي
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
