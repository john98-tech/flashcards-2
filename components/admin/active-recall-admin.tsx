'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildRecallSchedule } from '@/lib/active-recall/scheduler'
import {
  adminCreateRecallCourse,
  adminDeleteRecallCourse,
  adminDeleteRecallLesson,
  adminSaveRecallLesson,
  adminUpdateRecallSettings,
  adminUpdateRecallCourse,
} from '@/app/admin/active-recall-actions'
import type { RecallCourse, RecallLesson, RecallQuestionType, RecallSettings } from '@/lib/active-recall/types'

type Props = { courses: RecallCourse[]; lessons: RecallLesson[]; settings: RecallSettings | null; loadError: string | null }
type Draft = {
  id: string
  title: string
  content: string
  type: RecallQuestionType
  prompt: string
  answer: string
  options: string[]
  correctIndex: number
  additionalEnabled: boolean
  additionalType: RecallQuestionType
  additionalPrompt: string
  additionalAnswer: string
  additionalOptions: string[]
  additionalCorrectIndex: number
}

const emptyDraft = (): Draft => ({
  id: '',
  title: '',
  content: '',
  type: 'open',
  prompt: '',
  answer: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  additionalEnabled: false,
  additionalType: 'open',
  additionalPrompt: '',
  additionalAnswer: '',
  additionalOptions: ['', '', '', ''],
  additionalCorrectIndex: 0,
})
const inputClass = 'rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'
const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function ActiveRecallAdmin({ courses: initialCourses, lessons: initialLessons, settings: initialSettings, loadError }: Props) {
  const router = useRouter()
  const [courses, setCourses] = useState(initialCourses)
  const [lessons, setLessons] = useState(initialLessons)
  const [selectedId, setSelectedId] = useState(initialCourses[0]?.id ?? '')
  const [courseName, setCourseName] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [intervalsText, setIntervalsText] = useState(initialSettings?.intervals.join(', ') ?? '0, 1, 3, 6, 10, 15, 22, 29')
  const [dailyGoal, setDailyGoal] = useState(initialSettings?.dailyGoal ?? 12)
  const [restDay, setRestDay] = useState<number | null>(initialSettings?.restDay ?? null)
  const [schedulePreview, setSchedulePreview] = useState<Record<string, number> | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const draftStorageKey = 'sammaa-active-recall-admin-draft-v1'

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey)
      if (raw) {
        const saved = JSON.parse(raw) as { selectedId?: string; courseName?: string; startDate?: string; draft?: Draft; intervalsText?: string; dailyGoal?: number; restDay?: number | null }
        if (typeof saved.selectedId === 'string') setSelectedId(saved.selectedId)
        if (typeof saved.courseName === 'string') setCourseName(saved.courseName)
        if (typeof saved.startDate === 'string') setStartDate(saved.startDate)
        if (saved.draft && typeof saved.draft === 'object') setDraft(saved.draft)
        if (typeof saved.intervalsText === 'string') setIntervalsText(saved.intervalsText)
        if (Number.isFinite(saved.dailyGoal)) setDailyGoal(saved.dailyGoal!)
        if (saved.restDay === null || Number.isInteger(saved.restDay)) setRestDay(saved.restDay ?? null)
      }
    } catch {}
    setDraftReady(true)
  }, [])

  useEffect(() => {
    if (!draftReady) return
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify({ selectedId, courseName, startDate, draft, intervalsText, dailyGoal, restDay, savedAt: Date.now() }))
    } catch {}
  }, [draftReady, selectedId, courseName, startDate, draft, intervalsText, dailyGoal, restDay])

  useEffect(() => setCourses(initialCourses), [initialCourses])
  useEffect(() => setLessons(initialLessons), [initialLessons])
  useEffect(() => {
    if (initialSettings) {
      setIntervalsText(initialSettings.intervals.join(', '))
      setDailyGoal(initialSettings.dailyGoal)
      setRestDay(initialSettings.restDay)
    }
  }, [initialSettings])
  useEffect(() => {
    if (!courses.some((course) => course.id === selectedId)) setSelectedId(courses[0]?.id ?? '')
  }, [courses, selectedId])

  const selected = courses.find((course) => course.id === selectedId) ?? null
  const courseLessons = useMemo(
    () => lessons.filter((lesson) => lesson.courseId === selectedId).sort((a, b) => a.position - b.position),
    [lessons, selectedId],
  )

  const saveCourse = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!courseName.trim()) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const course = await adminCreateRecallCourse(courseName, startDate)
      setCourses((items) => [...items, course])
      setSelectedId(course.id)
      setCourseName('')
      setNotice('تم إنشاء الدورة.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء الدورة.')
    } finally {
      setBusy(false)
    }
  }

  const updateCourse = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const course = await adminUpdateRecallCourse(selected.id, selected.name, selected.startDate)
      setCourses((items) => items.map((item) => item.id === course.id ? { ...item, ...course } : item))
      setNotice('تم حفظ إعدادات الدورة.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ إعدادات الدورة.')
    } finally {
      setBusy(false)
    }
  }

  const saveLesson = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const options = draft.options
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => option.trim())
      const additionalOptions = draft.additionalOptions
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => option.trim())
      const lesson = await adminSaveRecallLesson({
        id: draft.id || undefined,
        courseId: selected.id,
        title: draft.title,
        content: draft.content,
        question: {
          prompt: draft.prompt,
          type: draft.type,
          answer: draft.type === 'open' ? draft.answer : '',
          options: draft.type === 'mcq' ? options.map(({ option }) => option) : [],
          correctIndex: draft.type === 'mcq' ? options.findIndex(({ index }) => index === draft.correctIndex) : 0,
        },
        additionalQuestion: draft.additionalEnabled ? {
          prompt: draft.additionalPrompt,
          type: draft.additionalType,
          answer: draft.additionalType === 'open' ? draft.additionalAnswer : '',
          options: draft.additionalType === 'mcq' ? additionalOptions.map(({ option }) => option) : [],
          correctIndex: draft.additionalType === 'mcq'
            ? additionalOptions.findIndex(({ index }) => index === draft.additionalCorrectIndex)
            : 0,
        } : null,
      })
      setLessons((items) => {
        const rest = items.filter((item) => item.id !== lesson.id)
        return [...rest, lesson]
      })
      setDraft(emptyDraft())
      setNotice('تم حفظ درس اليوم وسؤاله.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ الدرس.')
    } finally {
      setBusy(false)
    }
  }

  const removeCourse = async () => {
    if (!selected || !confirm(`حذف دورة «${selected.name}» وكل دروسها؟`)) return
    setBusy(true)
    setError('')
    try {
      await adminDeleteRecallCourse(selected.id)
      setCourses((items) => items.filter((item) => item.id !== selected.id))
      setLessons((items) => items.filter((item) => item.courseId !== selected.id))
      setSelectedId('')
      setDraft(emptyDraft())
      setNotice('تم حذف الدورة.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حذف الدورة.')
    } finally {
      setBusy(false)
    }
  }

  const removeLesson = async (lesson: RecallLesson) => {
    if (!confirm(`حذف درس «${lesson.title}»؟`)) return
    setBusy(true)
    setError('')
    try {
      await adminDeleteRecallLesson(lesson.id)
      setLessons((items) => items.filter((item) => item.id !== lesson.id))
      if (draft.id === lesson.id) setDraft(emptyDraft())
      setNotice('تم حذف الدرس.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حذف الدرس.')
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const intervals = intervalsText.split(',').map((value) => Number(value.trim()))
      const saved = await adminUpdateRecallSettings({ intervals, dailyGoal, restDay })
      setIntervalsText(saved.intervals.join(', '))
      setDailyGoal(saved.dailyGoal)
      setRestDay(saved.restDay)
      setNotice('تم حفظ إعدادات التكرار المتباعد.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ إعدادات التكرار.')
    } finally {
      setBusy(false)
    }
  }

  const previewSettings = () => {
    setError('')
    try {
      const intervals = intervalsText.split(',').map((value) => Number(value.trim()))
      const startDate = today()
      const end = new Date(`${startDate}T00:00:00Z`)
      end.setUTCDate(end.getUTCDate() + 29)
      const preview = buildRecallSchedule({
        lessonIds: ['preview-1', 'preview-2', 'preview-3'],
        startDate,
        endDate: end.toISOString().slice(0, 10),
        intervals,
        dailyGoal,
        restDay,
      })
      setSchedulePreview(preview.dailyCounts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذرت معاينة الجدول.')
      setSchedulePreview(null)
    }
  }

  const editLesson = (lesson: RecallLesson) => {
    setDraft({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      type: lesson.question.type,
      prompt: lesson.question.prompt,
      answer: lesson.question.answer,
      options: lesson.question.type === 'mcq' ? [...lesson.question.options, '', '', '', ''].slice(0, 6) : ['', '', '', ''],
      correctIndex: lesson.question.correctIndex,
      additionalEnabled: !!lesson.additionalQuestion,
      additionalType: lesson.additionalQuestion?.type ?? 'open',
      additionalPrompt: lesson.additionalQuestion?.prompt ?? '',
      additionalAnswer: lesson.additionalQuestion?.answer ?? '',
      additionalOptions: lesson.additionalQuestion?.type === 'mcq'
        ? [...lesson.additionalQuestion.options, '', '', '', '', '', ''].slice(0, 6)
        : ['', '', '', ''],
      additionalCorrectIndex: lesson.additionalQuestion?.correctIndex ?? 0,
    })
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <header className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold"><BookOpen className="size-5 text-primary" aria-hidden /> المراجعة اليومية والاستدعاء النشط</h2>
        <p className="mt-1 text-sm text-muted-foreground">أدرج المنهج ومحتوى الدروس مرة واحدة، ثم يختار كل طالب دروسه وتُنشأ جلسات المراجعة تلقائيًا.</p>
      </header>

      {loadError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">تعذر تحميل بيانات المراجعة اليومية: {loadError}. تأكد من تشغيل migration الخاصة بالقسم.</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border bg-accent p-3 text-sm">{notice}</p>}

      <form onSubmit={saveSettings} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_12rem_12rem_auto]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">فواصل المراجعة بالأيام (من اليوم الأول)
          <input className={inputClass} value={intervalsText} onChange={(event) => setIntervalsText(event.target.value)} placeholder="0, 1, 3, 6, 10, 15, 22, 29" dir="ltr" />
          <span>أدخل من 1 إلى 12 رقمًا صحيحًا متزايدًا، مفصولة بفواصل.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">هدف الجلسات اليومي
          <input className={inputClass} type="number" min={1} max={100} value={dailyGoal} onChange={(event) => setDailyGoal(Number(event.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">يوم الراحة (اختياري)
          <select className={inputClass} value={restDay ?? ''} onChange={(event) => setRestDay(event.target.value ? Number(event.target.value) : null)}>
            <option value="">بدون يوم راحة</option>
            <option value={0}>الأحد</option>
            <option value={1}>الإثنين</option>
            <option value={2}>الثلاثاء</option>
            <option value={3}>الأربعاء</option>
            <option value={4}>الخميس</option>
            <option value={5}>الجمعة</option>
            <option value={6}>السبت</option>
          </select>
          <span>ينقل المجدول الجلسات عن هذا اليوم قدر الإمكان.</span>
        </label>
        <Button className="self-end" type="submit" disabled={busy || !initialSettings}>حفظ إعدادات التكرار</Button>
        <Button className="sm:col-span-4 sm:justify-self-start" type="button" variant="outline" onClick={previewSettings}>معاينة جدول شهر لثلاثة دروس</Button>
      </form>
      {schedulePreview && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">معاينة توزيع الجلسات</h3>
          <ul className="mt-2 grid max-h-36 grid-cols-2 gap-x-4 gap-y-1 overflow-auto text-xs sm:grid-cols-4">
            {Object.entries(schedulePreview).filter(([, count]) => count > 0).map(([date, count]) => <li key={date}>{date}: {count} جلسة</li>)}
          </ul>
          {Object.values(schedulePreview).some((count) => count > dailyGoal) && <p role="alert" className="mt-2 text-sm font-semibold text-amber-700">بعض الأيام تتجاوز الهدف اليومي.</p>}
        </div>
      )}

      <form onSubmit={saveCourse} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_12rem_auto]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">اسم الدورة
          <input className={inputClass} value={courseName} maxLength={120} onChange={(event) => setCourseName(event.target.value)} placeholder="مثلًا: مراجعة الأحياء" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">أول يوم في الدورة
          <input className={inputClass} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <Button className="self-end" type="submit" disabled={busy || !courseName.trim()}><Plus aria-hidden /> إنشاء دورة</Button>
      </form>

      {courses.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">أنشئ أول دورة، ثم ابدأ بإضافة دروسها اليومية.</p>
      ) : (
        <>
          <label className="flex max-w-xl flex-col gap-1 text-xs font-medium text-muted-foreground">الدورة
            <select className={inputClass} value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setDraft(emptyDraft()) }}>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name} · {course.lessonCount} درس</option>)}
            </select>
          </label>

          {selected && (
            <>
              <form onSubmit={updateCourse} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_12rem_auto_auto]">
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">اسم الدورة
                  <input className={inputClass} value={selected.name} maxLength={120} onChange={(event) => setCourses((items) => items.map((item) => item.id === selected.id ? { ...item, name: event.target.value } : item))} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">تاريخ البداية
                  <input className={inputClass} type="date" value={selected.startDate} onChange={(event) => setCourses((items) => items.map((item) => item.id === selected.id ? { ...item, startDate: event.target.value } : item))} />
                </label>
                <Button type="submit" variant="outline" className="self-end" disabled={busy}>حفظ الإعدادات</Button>
                <Button type="button" variant="destructive" className="self-end" onClick={removeCourse} disabled={busy}><Trash2 aria-hidden /> حذف الدورة</Button>
              </form>

              {courseLessons.length > 0 && (
                <ol className="flex flex-col gap-2">
                  {courseLessons.map((lesson, index) => (
                    <li key={lesson.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold">{index + 1}</span>
                      <button type="button" className="min-w-0 flex-1 text-start" onClick={() => editLesson(lesson)}>
                        <span className="block truncate font-semibold">{lesson.title}</span>
                        <span className="text-xs text-muted-foreground">{lesson.question.type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مفتوح'}</span>
                      </button>
                      <Button type="button" variant="destructive" size="icon" aria-label={`حذف ${lesson.title}`} onClick={() => void removeLesson(lesson)} disabled={busy}><Trash2 aria-hidden /></Button>
                    </li>
                  ))}
                </ol>
              )}

              <form onSubmit={saveLesson} className="flex flex-col gap-4 rounded-xl border bg-card p-4">
                <h3 className="font-semibold">{draft.id ? 'تعديل درس اليوم' : `إضافة درس اليوم ${courseLessons.length + 1}`}</h3>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">عنوان الدرس
                  <input className={inputClass} value={draft.title} maxLength={200} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} required />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">محتوى الدرس للقراءة
                  <textarea className={`${inputClass} min-h-40 resize-y leading-7`} value={draft.content} maxLength={20000} onChange={(event) => setDraft((value) => ({ ...value, content: event.target.value }))} required dir="auto" />
                </label>
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="mb-2 text-sm font-semibold">نوع السؤال</legend>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" checked={draft.type === 'open'} onChange={() => setDraft((value) => ({ ...value, type: 'open' }))} /> سؤال مفتوح</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" checked={draft.type === 'mcq'} onChange={() => setDraft((value) => ({ ...value, type: 'mcq' }))} /> اختيار من متعدد</label>
                </fieldset>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">السؤال
                  <textarea className={`${inputClass} min-h-20 resize-y`} value={draft.prompt} maxLength={2000} onChange={(event) => setDraft((value) => ({ ...value, prompt: event.target.value }))} required dir="auto" />
                </label>
                {draft.type === 'open' ? (
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">الإجابة النموذجية (تظهر للطالب بعد أن يكتب إجابته)
                    <textarea className={`${inputClass} min-h-24 resize-y`} value={draft.answer} maxLength={10000} onChange={(event) => setDraft((value) => ({ ...value, answer: event.target.value }))} required dir="auto" />
                  </label>
                ) : (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-semibold">الاختيارات — حدد الإجابة الصحيحة</legend>
                    {draft.options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input type="radio" name="recall-correct-option" aria-label={`الإجابة الصحيحة: الاختيار ${index + 1}`} checked={draft.correctIndex === index} onChange={() => setDraft((value) => ({ ...value, correctIndex: index }))} />
                        <input className={`${inputClass} flex-1`} value={option} maxLength={500} onChange={(event) => setDraft((value) => ({ ...value, options: value.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={`الاختيار ${index + 1}`} dir="auto" />
                      </div>
                    ))}
                    {draft.options.length < 6 && <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setDraft((value) => ({ ...value, options: [...value.options, ''] }))}><Plus aria-hidden /> إضافة اختيار</Button>}
                    <p className="text-xs text-muted-foreground">اكتب اختيارين على الأقل، وبحد أقصى 6 اختيارات.</p>
                  </fieldset>
                )}
                <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold">
                  <input type="checkbox" checked={draft.additionalEnabled} onChange={(event) => setDraft((value) => ({ ...value, additionalEnabled: event.target.checked }))} />
                  إضافة سؤال تفاعلي ثانٍ (اختياري)
                </label>
                {draft.additionalEnabled && (
                  <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
                    <legend className="px-1 text-sm font-bold">السؤال الإضافي</legend>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm"><input type="radio" checked={draft.additionalType === 'open'} onChange={() => setDraft((value) => ({ ...value, additionalType: 'open' }))} /> سؤال مفتوح</label>
                      <label className="flex items-center gap-2 text-sm"><input type="radio" checked={draft.additionalType === 'mcq'} onChange={() => setDraft((value) => ({ ...value, additionalType: 'mcq' }))} /> اختيار من متعدد</label>
                    </div>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">السؤال
                      <textarea className={`${inputClass} min-h-20 resize-y`} value={draft.additionalPrompt} maxLength={2000} onChange={(event) => setDraft((value) => ({ ...value, additionalPrompt: event.target.value }))} required={draft.additionalEnabled} dir="auto" />
                    </label>
                    {draft.additionalType === 'open' ? (
                      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">الإجابة النموذجية
                        <textarea className={`${inputClass} min-h-24 resize-y`} value={draft.additionalAnswer} maxLength={10000} onChange={(event) => setDraft((value) => ({ ...value, additionalAnswer: event.target.value }))} required={draft.additionalEnabled} dir="auto" />
                      </label>
                    ) : (
                      <fieldset className="flex flex-col gap-2">
                        <legend className="mb-1 text-sm font-semibold">الاختيارات — حدد الإجابة الصحيحة</legend>
                        {draft.additionalOptions.map((option, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input type="radio" name="recall-correct-option-2" aria-label={`الإجابة الصحيحة للسؤال الإضافي: الاختيار ${index + 1}`} checked={draft.additionalCorrectIndex === index} onChange={() => setDraft((value) => ({ ...value, additionalCorrectIndex: index }))} />
                            <input className={`${inputClass} flex-1`} value={option} maxLength={500} onChange={(event) => setDraft((value) => ({ ...value, additionalOptions: value.additionalOptions.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={`الاختيار ${index + 1}`} dir="auto" />
                          </div>
                        ))}
                        {draft.additionalOptions.length < 6 && <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setDraft((value) => ({ ...value, additionalOptions: [...value.additionalOptions, ''] }))}><Plus aria-hidden /> إضافة اختيار</Button>}
                        <p className="text-xs text-muted-foreground">اكتب اختيارين على الأقل، وبحد أقصى 6 اختيارات.</p>
                      </fieldset>
                    )}
                  </fieldset>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={busy || !selected}><Loader2 className={busy ? 'animate-spin' : 'hidden'} aria-hidden /> {draft.id ? 'حفظ التعديل' : 'إضافة الدرس'}</Button>
                  {draft.id && <Button type="button" variant="outline" onClick={() => setDraft(emptyDraft())} disabled={busy}>إلغاء التعديل</Button>}
                </div>
              </form>
            </>
          )}
        </>
      )}
    </div>
  )
}
