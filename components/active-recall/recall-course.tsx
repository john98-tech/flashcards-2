'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarDays, Check, CircleHelp, Loader2 } from 'lucide-react'
import { markRecallSessionComplete, saveRecallPlan } from '@/app/active-recall/actions'
import { buildRecallSchedule } from '@/lib/active-recall/scheduler'
import type { RecallQuestion, RecallSettings, StudentRecallPlan, StudentRecallLesson } from '@/lib/active-recall/types'

type Course = {
  id: string
  name: string
  lessons: StudentRecallLesson[]
  plan: StudentRecallPlan | null
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function dayCount(start: string, end: string) {
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ar-EG', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${date}T00:00:00Z`))
}

export function RecallCourse({ course, today, settings, testMode = false, testTime }: { course: Course; today: string; settings: RecallSettings; testMode?: boolean; testTime?: string }) {
  const router = useRouter()
  // Include lessons added by the admin after a student created their plan.
  // When the catalog changes, open the editor so the student can regenerate the schedule.
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>(() =>
    course.plan ? Array.from(new Set([...course.plan.lessonIds, ...course.lessons.map((lesson) => lesson.id)])) : course.lessons.map((lesson) => lesson.id),
  )
  const [durationDays, setDurationDays] = useState(() =>
    course.plan && course.plan.endDate >= today ? Math.max(1, dayCount(today, course.plan.endDate)) : 30,
  )
  const [examDate, setExamDate] = useState(course.plan?.examDate ?? '')
  const [editing, setEditing] = useState(
    !course.plan || course.lessons.some((lesson) => !course.plan?.lessonIds.includes(lesson.id)),
  )
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [revealedQuestions, setRevealedQuestions] = useState<number[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [choices, setChoices] = useState<Record<number, number>>({})
  const [noAnswer, setNoAnswer] = useState<number[]>([])
  const [selfAssessment, setSelfAssessment] = useState<'knew_it' | 'review_again' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const endDate = useMemo(() => {
    const proposed = addDays(today, durationDays - 1)
    return examDate && examDate < proposed ? examDate : proposed
  }, [today, durationDays, examDate])
  const preview = useMemo(() => {
    if (
      !selectedLessonIds.length ||
      !Number.isInteger(durationDays) ||
      durationDays < 1 ||
      durationDays > 366 ||
      endDate < today
    ) return null
    return buildRecallSchedule({
      lessonIds: selectedLessonIds,
      startDate: today,
      endDate,
      intervals: settings.intervals,
      dailyGoal: settings.dailyGoal,
      restDay: settings.restDay,
    })
  }, [selectedLessonIds, today, endDate, durationDays, settings])

  const dueSessions = useMemo(() => (course.plan?.sessions ?? [])
    .filter((session) =>
      (session.status === 'pending' || session.status === 'rescheduled') && session.scheduledDate <= today
      || session.status === 'completed' && session.scheduledDate === today,
    )
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.reviewNumber - b.reviewNumber), [course.plan, today])
  const activeSessionId = dueSessions.some((session) => session.id === selectedSessionId)
    ? selectedSessionId
    : dueSessions.find((session) => session.status !== 'completed')?.id ?? dueSessions[0]?.id ?? ''
  const activeSession = dueSessions.find((session) => session.id === activeSessionId) ?? null
  const lesson = course.lessons.find((item) => item.id === activeSession?.lessonId) ?? null
  const questions = lesson ? [lesson.question, lesson.additionalQuestion].filter((question): question is RecallQuestion => !!question) : []
  const completedToday = dueSessions.filter((session) => session.scheduledDate === today && session.status === 'completed').length
  const pendingToday = dueSessions.filter((session) => session.scheduledDate === today && session.status !== 'completed').length
  const overdueCount = dueSessions.filter((session) => session.scheduledDate < today && session.status !== 'completed').length

  const toggleLesson = (lessonId: string) => setSelectedLessonIds((current) =>
    current.includes(lessonId) ? current.filter((id) => id !== lessonId) : [...current, lessonId],
  )

  const confirmPlan = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await saveRecallPlan({
        courseId: course.id,
        lessonIds: selectedLessonIds,
        durationDays,
        examDate: examDate || null,
        testDate: testMode ? today : null,
      })
      setNotice(`تم حفظ الخطة: ${result.sessions.length} جلسة مراجعة حتى ${formatDate(result.endDate)}.`)
      setEditing(false)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ الخطة. حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }

  const reveal = (index: number) => {
    setRevealedQuestions((current) => current.includes(index) ? current : [...current, index])
  }
  const finishSession = async () => {
    if (!activeSession) return
    setBusy(true)
    setError('')
    try {
      await markRecallSessionComplete(course.id, activeSession.id, selfAssessment, testMode ? today : null)
      setNotice('تم إنهاء جلسة المراجعة وحفظها.')
      setSelectedSessionId('')
      setRevealedQuestions([])
      setAnswers({})
      setChoices({})
      setNoAnswer([])
      setSelfAssessment(null)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ الجلسة. حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-muted/40" dir="rtl">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-3 py-3">
          <Link href="/active-recall" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground" aria-label="العودة للمراجعة اليومية">
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold">{course.name}</h1>
            <p className="text-xs text-muted-foreground">{course.plan ? `الخطة حتى ${formatDate(course.plan.endDate)}` : 'اختر الدروس التي سبق أن ذاكرتها'}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-5 sm:px-4 sm:py-8">
        {testMode && <p className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm font-semibold">وضع اختبار التاريخ والوقت مفعّل ({formatDate(today)}{testTime ? ` — ${testTime}` : ''}) — الموقع شغال بالتاريخ ده، وأي خطة أو جلسة تحفظها هتتسجل على هذا اليوم.</p>}
        {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="rounded-xl border bg-accent p-3 text-sm">{notice}</p>}

        {editing ? (
          <section className="space-y-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
            <div>
              <h2 className="text-xl font-bold">{course.plan ? 'تعديل خطة المراجعة' : 'إنشاء خطة مراجعة'}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">اختار الدروس اللي ذاكرتها بالفعل. هتتكرر مراجعتها تلقائيًا من غير ما تظهر دروس جديدة.</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">دروس المنهج <span className="text-sm text-muted-foreground">({selectedLessonIds.length} مختارة)</span></p>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setSelectedLessonIds(course.lessons.map((item) => item.id))}>تحديد الكل</button>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setSelectedLessonIds([])}>إلغاء التحديد</button>
              </div>
            </div>
            {course.lessons.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {course.lessons.map((item) => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 hover:border-primary/40">
                      <input type="checkbox" checked={selectedLessonIds.includes(item.id)} onChange={() => toggleLesson(item.id)} />
                      <span className="min-w-0">
                        <span className="block text-xs text-muted-foreground">الدرس {item.position}</span>
                        <span className="block truncate font-medium">{item.title}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد دروس منشورة في هذا المنهج بعد.</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold">مدة المراجعة بالأيام
                <div className="flex gap-2">
                  <select className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2" value={[1, 7, 14, 30].includes(durationDays) ? durationDays : 'custom'} onChange={(event) => setDurationDays(event.target.value === 'custom' ? 21 : Number(event.target.value))}>
                    <option value={1}>يوم واحد</option>
                    <option value={7}>أسبوع · 7 أيام</option>
                    <option value={14}>أسبوعان · 14 يومًا</option>
                    <option value={30}>شهر · 30 يومًا</option>
                    <option value="custom">مدة مخصصة</option>
                  </select>
                  <input aria-label="عدد أيام المراجعة" className="w-24 rounded-lg border bg-background px-3 py-2" type="number" min={1} max={366} value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))} />
                </div>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">موعد الامتحان (اختياري)
                <input className="rounded-lg border bg-background px-3 py-2" type="date" min={today} value={examDate} onChange={(event) => setExamDate(event.target.value)} />
              </label>
            </div>

            <div className="rounded-xl border bg-muted/40 p-4">
              <h3 className="font-bold">معاينة الخطة</h3>
              <p className="mt-1 text-sm text-muted-foreground">{selectedLessonIds.length} دروس · {dayCount(today, endDate)} يوم · {preview?.sessions.length ?? 0} جلسة متوقعة · الهدف اليومي المقترح {preview?.recommendedDailyGoal ?? settings.dailyGoal} جلسة{settings.restDay === null ? '' : ' · يتم تجنب يوم الراحة قدر الإمكان'}</p>
              {preview && (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">تكرار كل درس {settings.intervals.length} مرات. أول مراجعة {formatDate(today)} وآخر مراجعة متوقعة {formatDate(Object.keys(preview.dailyCounts).filter((date) => preview.dailyCounts[date] > 0).at(-1) ?? today)}.</p>
                  <ul className="mt-3 grid max-h-40 grid-cols-2 gap-x-4 gap-y-1 overflow-auto text-xs sm:grid-cols-4">
                    {Object.entries(preview.dailyCounts).filter(([, count]) => count > 0).map(([date, count]) => <li key={date}>{formatDate(date)}: {count} جلسة</li>)}
                  </ul>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold">أول وآخر مراجعة لكل درس</summary>
                    <ul className="mt-2 grid max-h-36 gap-1 overflow-auto text-xs sm:grid-cols-2">
                      {selectedLessonIds.map((lessonId) => {
                        const lesson = course.lessons.find((item) => item.id === lessonId)
                        const dates = preview.sessions.filter((session) => session.lessonId === lessonId).map((session) => session.scheduledDate).sort()
                        const firstDate = dates[0] ?? today
                        const lastDate = dates.at(-1) ?? firstDate
                        return <li key={lessonId}>{lesson?.title}: {formatDate(firstDate)} – {formatDate(lastDate)}</li>
                      })}
                    </ul>
                  </details>
                  {preview.overloadedDays.length > 0 && <p role="alert" className="mt-3 text-sm font-semibold text-amber-700">بعض الأيام تتجاوز الهدف اليومي؛ جرّب زيادة المدة أو تقليل الدروس.</p>}
                  {examDate && dayCount(today, endDate) === 1 && <p role="alert" className="mt-2 text-sm font-semibold text-amber-700">موعد الامتحان قريب جدًا؛ ستُضغط الجلسات في يوم واحد.</p>}
                </>
              )}
              {!preview && selectedLessonIds.length > 0 && <p role="alert" className="mt-2 text-sm text-destructive">تحقق من مدة الخطة وتاريخ الامتحان.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !selectedLessonIds.length || !preview} onClick={() => void confirmPlan()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
                {busy ? 'جارٍ حفظ الخطة…' : 'تأكيد وإنشاء الخطة'}
              </button>
              {course.plan && <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-lg border px-4 py-2.5 font-semibold">رجوع للخطة الحالية</button>}
            </div>
          </section>
        ) : course.plan ? (
          <>
            <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">مراجعة اليوم</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(today)}{testMode && testTime ? ` · ${testTime}` : ''} · {pendingToday + completedToday} جلسة مطلوبة · {completedToday} مكتملة · {pendingToday} متبقية</p>
                  {overdueCount > 0 && <p className="mt-2 text-sm font-semibold text-amber-700">لديك {overdueCount} جلسة متأخرة، موزعة ضمن قائمة اليوم.</p>}
                  {overdueCount > 0 && (
                    <button type="button" disabled={busy} onClick={() => void confirmPlan()} className="mt-3 rounded-lg border border-amber-600/40 px-3 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50">
                      إعادة توزيع الجلسات المتأخرة حتى نهاية الخطة
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => setEditing(true)} className="rounded-lg border px-3 py-2 text-sm font-semibold">تعديل الدروس والمدة</button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">إجمالي الخطة: {course.plan.sessions.filter((item) => item.status !== 'skipped').length} جلسة · {course.plan.lessonIds.length} دروس · تنتهي {formatDate(course.plan.endDate)}</p>
            </section>

            {dueSessions.length === 0 ? (
              <section className="rounded-2xl border border-dashed bg-card p-8 text-center">
                <Check className="mx-auto size-8 text-primary" aria-hidden />
                <h2 className="mt-2 font-bold">لا توجد جلسات مستحقة الآن</h2>
                <p className="mt-1 text-sm text-muted-foreground">ستظهر مراجعاتك هنا في موعدها. الجلسات المستقبلية لا تُعرض كمستحقة.</p>
              </section>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
                <aside className="space-y-2">
                  <h2 className="px-1 text-sm font-bold">جلسات اليوم والمتأخرة</h2>
                  {dueSessions.map((item) => (
                    <button key={item.id} type="button" onClick={() => { setSelectedSessionId(item.id); setRevealedQuestions([]); setAnswers({}); setChoices({}); setNoAnswer([]); setSelfAssessment(null) }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-start ${item.id === activeSessionId ? 'border-primary bg-primary/5' : 'bg-card'}`}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold">{item.status === 'completed' ? <Check className="size-4" aria-label="مكتملة" /> : item.reviewNumber}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.lessonTitle}</span>
                        <span className="block text-xs text-muted-foreground">{item.scheduledDate < today ? `متأخرة · ${formatDate(item.scheduledDate)}` : `مراجعة رقم ${item.reviewNumber}`}</span>
                      </span>
                    </button>
                  ))}
                </aside>

                <section className="min-w-0 space-y-4">
                  {activeSession && lesson && activeSession.status === 'completed' ? (
                    <div className="rounded-2xl border bg-card p-6 text-center">
                      <Check className="mx-auto size-8 text-emerald-600" aria-hidden />
                      <h2 className="mt-2 font-bold">اكتملت هذه الجلسة</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{lesson.title} · المراجعة رقم {activeSession.reviewNumber}</p>
                    </div>
                  ) : activeSession && lesson ? (
                    <>
                      <article className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
                        <p className="text-sm font-semibold text-primary">مراجعة رقم {activeSession.reviewNumber}{activeSession.scheduledDate < today ? ' · جلسة متأخرة' : ''}</p>
                        <h2 className="mt-1 text-xl font-bold">{lesson.title}</h2>
                        <div className="mt-5 whitespace-pre-wrap text-base leading-8" dir="auto">{lesson.content}</div>
                      </article>
                      {questions.map((question, index) => (
                        <QuestionCard
                          key={`${activeSession.id}-${index}`}
                          question={question}
                          index={index}
                          answer={answers[index] ?? ''}
                          choice={choices[index]}
                          revealed={revealedQuestions.includes(index)}
                          markedNoAnswer={noAnswer.includes(index)}
                          onAnswer={(value) => setAnswers((current) => ({ ...current, [index]: value }))}
                          onChoice={(value) => setChoices((current) => ({ ...current, [index]: value }))}
                          onNoAnswer={() => setNoAnswer((current) => current.includes(index) ? current : [...current, index])}
                          onReveal={() => reveal(index)}
                        />
                      ))}
                      <section className="rounded-xl border bg-card p-4">
                        <p className="mb-2 text-sm font-semibold">تقييمك لنفسك (اختياري)</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setSelfAssessment('knew_it')} className={`rounded-lg border px-3 py-2 text-sm ${selfAssessment === 'knew_it' ? 'border-primary bg-primary/5 font-semibold' : ''}`}>عرفت الإجابة</button>
                          <button type="button" onClick={() => setSelfAssessment('review_again')} className={`rounded-lg border px-3 py-2 text-sm ${selfAssessment === 'review_again' ? 'border-primary bg-primary/5 font-semibold' : ''}`}>محتاج أراجعها</button>
                        </div>
                      </section>
                      <button type="button" disabled={busy || revealedQuestions.length !== questions.length} onClick={() => void finishSession()} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">
                        {busy ? 'بيحفظ الجلسة…' : 'إنهاء مراجعة الدرس'}
                      </button>
                      {revealedQuestions.length !== questions.length && <p className="text-center text-xs text-muted-foreground">حاول الإجابة أو اختر «مش عارف» ثم اكشف الإجابة قبل إنهاء الجلسة.</p>}
                    </>
                  ) : null}
                </section>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد دروس متاحة في هذا المنهج بعد.</p>
        )}
      </main>
    </div>
  )
}

function QuestionCard({
  question,
  index,
  answer,
  choice,
  revealed,
  markedNoAnswer,
  onAnswer,
  onChoice,
  onNoAnswer,
  onReveal,
}: {
  question: RecallQuestion
  index: number
  answer: string
  choice: number | undefined
  revealed: boolean
  markedNoAnswer: boolean
  onAnswer: (value: string) => void
  onChoice: (value: number) => void
  onNoAnswer: () => void
  onReveal: () => void
}) {
  const canReveal = question.type === 'open' ? !!answer.trim() || markedNoAnswer : choice !== undefined || markedNoAnswer
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <p className="text-xs font-semibold text-primary">{index === 0 ? 'السؤال الأساسي' : 'سؤال إضافي (اختياري)'}</p>
      <h3 className="text-lg font-bold" dir="auto">{question.prompt}</h3>
      {question.type === 'mcq' ? (
        <div className="space-y-2">
          {question.options.map((option, optionIndex) => (
            <label key={`${index}-${optionIndex}`} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${revealed && optionIndex === question.correctIndex ? 'border-emerald-500 bg-emerald-50' : choice === optionIndex ? 'border-primary bg-primary/5' : ''}`}>
              <input type="radio" name={`question-${index}`} checked={choice === optionIndex} disabled={revealed} onChange={() => onChoice(optionIndex)} />
              <span dir="auto">{option}</span>
            </label>
          ))}
        </div>
      ) : (
        <textarea className="min-h-24 w-full rounded-xl border bg-background p-3 leading-7" value={answer} disabled={revealed} onChange={(event) => onAnswer(event.target.value)} placeholder="اكتب إجابتك قبل كشف الحل…" dir="auto" />
      )}
      {!revealed ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!canReveal} onClick={onReveal} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">كشف الإجابة</button>
          <button type="button" disabled={markedNoAnswer} onClick={onNoAnswer} className="inline-flex items-center gap-1 rounded-lg border px-4 py-2.5 text-sm"><CircleHelp className="size-4" aria-hidden /> مش عارف الإجابة</button>
        </div>
      ) : (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h4 className="font-bold">{question.type === 'mcq' ? 'الإجابة الصحيحة' : 'الإجابة النموذجية'}</h4>
          <p className="mt-1 whitespace-pre-wrap leading-7" dir="auto">{question.type === 'mcq' ? question.options[question.correctIndex] : question.answer}</p>
          {question.type === 'mcq' && choice !== undefined && <p className="mt-2 text-sm">{choice === question.correctIndex ? 'إجابة صحيحة، أحسنت!' : 'راجع الإجابة الصحيحة أعلاه.'}</p>}
        </div>
      )}
    </section>
  )
}
