'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function RecallTestDatePicker({
  actualToday,
  selectedDate,
  actualTime,
  selectedTime,
}: {
  actualToday: string
  selectedDate: string
  actualTime: string
  selectedTime: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isDateSimulating = selectedDate !== actualToday
  const isTimeSimulating = selectedTime !== actualTime
  const isSimulating = isDateSimulating || isTimeSimulating

  function changeTestValue(key: 'testDate' | 'testTime', value: string, actualValue: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== actualValue) params.set(key, value)
    else params.delete(key)
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  function resetSimulation() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('testDate')
    params.delete('testTime')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <section className="mx-auto mb-4 w-full max-w-5xl px-3 sm:px-4">
      <div className={`rounded-xl border p-4 ${isSimulating ? 'border-amber-500/60 bg-amber-500/10' : 'bg-card'}`} dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold">أداة اختبار تاريخ ووقت المراجعة</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              غيّر اليوم والساعة لمعاينة المراجعة. الاختبار للعرض فقط ولا يحفظ خطة أو إنجاز جلسة. جدولة المراجعات حاليًا تعتمد على اليوم وليس الساعة.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
            اليوم التجريبي
            <input
              aria-label="اختيار اليوم التجريبي للمراجعة اليومية"
              type="date"
              value={selectedDate}
              onChange={(event) => changeTestValue('testDate', event.target.value, actualToday)}
              className="rounded-lg border bg-background px-3 py-2"
            />
          </label>
          <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
            الوقت التجريبي
            <input
              aria-label="اختيار الوقت التجريبي للمراجعة اليومية"
              type="time"
              value={selectedTime}
              onChange={(event) => changeTestValue('testTime', event.target.value, actualTime)}
              className="rounded-lg border bg-background px-3 py-2"
            />
          </label>
          {isSimulating && (
            <button type="button" onClick={resetSimulation} className="rounded-lg border px-3 py-2 text-sm font-semibold">
              الرجوع للتاريخ والوقت الحقيقيين
            </button>
          )}
        </div>
        {isSimulating && (
          <p className="mt-3 text-xs font-semibold text-amber-800">
            وضع الاختبار مفعّل: {selectedDate} — {selectedTime}
          </p>
        )}
      </div>
    </section>
  )
}
