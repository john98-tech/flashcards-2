'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowRight, Check, LockKeyhole, PenLine, RotateCcw } from 'lucide-react'
import { markRecallLessonComplete } from '@/app/active-recall/actions'
import type { HandwritingEditorHandle } from '@/components/handwriting/HandwritingEditor'
import type { StudentRecallCourse, StudentRecallLesson } from '@/lib/active-recall/types'

const HandwritingEditor = dynamic(
  () => import('@/components/handwriting/HandwritingEditor').then((module) => module.HandwritingEditor),
  { ssr: false, loading: () => <div className="grid h-56 place-items-center rounded-xl border bg-white text-sm text-muted-foreground">بيجهز دفتر الكتابة…</div> },
)

export function RecallCourse({ course }: { course: StudentRecallCourse }) {
  const boardRef = useRef<HandwritingEditorHandle>(null)
  const availableLessons = course.lessons.filter((lesson) => lesson.available)
  const todayLesson = availableLessons.find((lesson) => lesson.day === course.currentDay)
  const [selectedId, setSelectedId] = useState(todayLesson?.id ?? availableLessons.at(-1)?.id ?? '')
  const [completed, setCompleted] = useState(course.completedLessonIds)
  const [mode, setMode] = useState<'keyboard' | 'handwriting'>('keyboard')
  const [answerText, setAnswerText] = useState('')
  const [choice, setChoice] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [notice, setNotice] = useState('')
  const [savingCompletion, setSavingCompletion] = useState(false)

  const lesson = course.lessons.find((item) => item.id === selectedId) ?? null
  const resetAnswer = (next: StudentRecallLesson) => {
    setSelectedId(next.id)
    setMode('keyboard')
    setAnswerText('')
    setChoice(null)
    setChecked(false)
    setRevealed(false)
    setNotice('')
  }

  const markComplete = async (id: string) => {
    setSavingCompletion(true)
    try {
      await markRecallLessonComplete(course.id, id)
      const next = [...new Set([...completed, id])]
      setCompleted(next)
      setNotice('تم حفظ تقدمك في حسابك.')
      return true
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر حفظ تقدمك. حاول مرة أخرى.')
      return false
    } finally {
      setSavingCompletion(false)
    }
  }

  const submitOpenAnswer = () => {
    const hasAnswer = mode === 'keyboard' ? !!answerText.trim() : !!boardRef.current?.hasContent()
    if (!hasAnswer) {
      setNotice('اكتب إجابتك الأول، سواء بالكيبورد أو بالقلم.')
      return
    }
    setRevealed(true)
    setNotice('')
  }

  const question = lesson?.question

  return (
    <div className="min-h-dvh bg-muted/40" dir="rtl">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-3 py-3">
          <Link href="/active-recall" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground" aria-label="العودة للدورات">
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold">{course.name}</h1>
            <p className="text-xs text-muted-foreground">{course.currentDay > 0 ? `اليوم ${course.currentDay}` : 'الدورة لم تبدأ بعد'}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-5 px-3 py-5 sm:px-4 sm:py-8 lg:grid-cols-[15rem_1fr]">
        <aside className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold">أيام الدورة</h2>
          {course.lessons.map((item) => {
            const isComplete = item.available && completed.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                disabled={!item.available}
                onClick={() => resetAnswer(item)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-start transition-colors ${
                  !item.available ? 'cursor-not-allowed bg-muted/50 text-muted-foreground' :
                  item.id === selectedId ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/40'
                }`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold">
                  {isComplete ? <Check className="size-4" aria-label="مكتمل" /> : item.available ? item.day : <LockKeyhole className="size-4" aria-label="مقفل" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">اليوم {item.day}</span>
                  <span className="block truncate text-sm font-semibold">{item.available ? item.title : 'يفتح في موعده'}</span>
                </span>
              </button>
            )
          })}
          {course.lessons.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">لم تتم إضافة دروس لهذه الدورة بعد.</p>}
        </aside>

        <section className="min-w-0 space-y-4">
          {!lesson && (
            <div className="rounded-2xl border bg-card p-6 text-center">
              <h2 className="text-xl font-bold">
                {course.lessons.length === 0 ? 'لا توجد دروس بعد' : course.currentDay < 1 ? 'الدورة ستبدأ قريبًا' : 'اكتملت دروس الدورة'}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {course.lessons.length === 0
                  ? 'لم تتم إضافة دروس لهذه الدورة بعد.'
                  : course.currentDay < 1
                  ? `تبدأ الدورة يوم ${new Date(`${course.startDate}T00:00:00Z`).toLocaleDateString('ar-EG')}.`
                  : 'يمكنك فتح الأيام السابقة من القائمة لمراجعتها.'}
              </p>
            </div>
          )}

          {lesson?.content && question && (
            <>
              <article className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
                <p className="text-sm font-semibold text-primary">درس اليوم {lesson.day}</p>
                <h2 className="mt-1 text-xl font-bold">{lesson.title}</h2>
                <div className="mt-5 whitespace-pre-wrap text-base leading-8" dir="auto">{lesson.content}</div>
              </article>

              <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="recall-question-title">
                <div>
                  <p className="text-sm font-semibold text-primary">استدعِ المعلومة من ذاكرتك</p>
                  <h2 id="recall-question-title" className="mt-1 text-lg font-bold" dir="auto">{question.prompt}</h2>
                </div>

                {question.type === 'mcq' ? (
                  <div className="space-y-2">
                    {question.options.map((option, index) => {
                      const isCorrect = index === question.correctIndex
                      const isWrongSelection = checked && choice === index && !isCorrect
                      return (
                        <label key={`${lesson.id}-${index}`} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                          checked && isCorrect ? 'border-emerald-500 bg-emerald-50' :
                          isWrongSelection ? 'border-destructive bg-destructive/5' :
                          choice === index ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
                        }`}>
                          <input type="radio" name={`recall-choice-${lesson.id}`} checked={choice === index} disabled={checked && choice === question.correctIndex} onChange={() => { setChoice(index); setChecked(false) }} />
                          <span className="text-sm" dir="auto">{option}</span>
                        </label>
                      )
                    })}
                    {checked && <p role="status" className={choice === question.correctIndex ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-destructive'}>
                      {choice === question.correctIndex ? 'إجابة صحيحة! أحسنت.' : `مش دي الإجابة الصحيحة. الإجابة: ${question.options[question.correctIndex]}`}
                    </p>}
                    <button type="button" disabled={choice === null || savingCompletion || checked && choice === question.correctIndex} onClick={async () => {
                      if (choice === question.correctIndex) {
                        if (await markComplete(lesson.id)) setChecked(true)
                      } else {
                        setChecked(true)
                      }
                    }} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">
                      {savingCompletion ? 'بيحفظ تقدمك…' : checked && choice === question.correctIndex ? 'تمت المراجعة' : 'تأكيد الإجابة'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setMode('keyboard')} className={`rounded-lg border px-3 py-2 text-sm ${mode === 'keyboard' ? 'border-primary bg-primary/5 font-semibold' : ''}`}>الكتابة بالكيبورد</button>
                      <button type="button" onClick={() => setMode('handwriting')} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${mode === 'handwriting' ? 'border-primary bg-primary/5 font-semibold' : ''}`}><PenLine className="size-4" aria-hidden /> الكتابة بالقلم</button>
                    </div>
                    {mode === 'keyboard' ? (
                      <textarea value={answerText} onChange={(event) => setAnswerText(event.target.value)} placeholder="اكتب إجابتك هنا…" className="min-h-36 w-full resize-y rounded-xl border bg-background p-3 leading-7 outline-none focus:ring-2 focus:ring-ring" dir="auto" />
                    ) : (
                      <HandwritingEditor key={`${lesson.id}-handwriting`} ref={boardRef} maxPages={5} />
                    )}
                    {!revealed ? (
                      <button type="button" onClick={submitOpenAnswer} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">اعرض الإجابة النموذجية</button>
                    ) : (
                      <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <h3 className="font-bold">الإجابة النموذجية</h3>
                        <p className="whitespace-pre-wrap leading-7" dir="auto">{question.answer}</p>
                        <p className="text-sm text-muted-foreground">راجع إجابتك بنفسك، ثم اختر:</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button type="button" disabled={savingCompletion} onClick={() => void markComplete(lesson.id)} className="rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Check className="me-1 inline size-4" aria-hidden /> {savingCompletion ? 'بيحفظ تقدمك…' : 'عرفت الإجابة'}</button>
                          <button type="button" onClick={() => { setRevealed(false); setNotice('راجع الدرس وحاول الإجابة مرة أخرى.') }} className="rounded-lg border px-3 py-2.5 text-sm font-semibold"><RotateCcw className="me-1 inline size-4" aria-hidden /> محتاج أراجعها</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {notice && <p role="status" className="text-center text-sm text-muted-foreground">{notice}</p>}
              </section>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
