'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, CloudUpload, Eraser, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WordEditor } from '@/components/admin/word-editor'
import {
  adminCreateDictationLesson,
  adminCreateDictationSubject,
  adminDeleteDictationLesson,
  adminUpdateDictationLesson,
} from '@/app/admin/dictation-actions'
import { DICTATION_LIMITS, type DictationLesson, type DictationSubjectSummary } from '@/lib/dictation/types'

/**
 * Admin section for written dictation ("التسميع بالكتابة").
 * Mirrors the flashcards DeckEditor structure (group -> deck becomes subject -> lesson) but works
 * only on the separate dictation_* data. It must not import anything from the flashcards code.
 */

export type DictationAdminData = {
  subjects: DictationSubjectSummary[]
  lessons: DictationLesson[]
  /** Set when the dictation tables could not be read (e.g. the migration is not applied yet). */
  loadError: string | null
}

type Draft = { id: string; subjectId: string; title: string; description: string }
const emptyDraft: Draft = { id: '', subjectId: '', title: '', description: '' }

type Status =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string }

const inputClass =
  'rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

export function DictationAdmin({ subjects: initialSubjects, lessons: initialLessons, loadError }: DictationAdminData) {
  const router = useRouter()
  const [subjects, setSubjects] = useState(initialSubjects)
  const [lessons, setLessons] = useState(initialLessons)
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialSubjects[0]?.id ?? '')
  const [moveLessonId, setMoveLessonId] = useState('')
  const [moveTargetId, setMoveTargetId] = useState(initialSubjects[0]?.id ?? '')
  const [newLessonName, setNewLessonName] = useState('')
  const [newSubjectName, setNewSubjectName] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null)
  const [active, setActive] = useState(false)
  const [subjectBusy, setSubjectBusy] = useState(false)
  const [subjectError, setSubjectError] = useState('')
  const [save, setSave] = useState<Status>({ status: 'idle' })
  const [move, setMove] = useState<Status>({ status: 'idle' })
  const [removing, setRemoving] = useState(false)

  // Keep local lists in step with the server after router.refresh().
  useEffect(() => setSubjects(initialSubjects), [initialSubjects])
  useEffect(() => setLessons(initialLessons), [initialLessons])

  const saving = save.status === 'busy'
  const moving = move.status === 'busy'
  const busy = saving || moving || removing
  const dirty = active && (!savedDraft || JSON.stringify(savedDraft) !== JSON.stringify(draft))
  const lessonsOf = (subjectId: string) => lessons.filter((l) => l.subjectId === subjectId).sort(byOrder)
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? '—'

  const confirmDiscard = () => !dirty || confirm('التعديلات اللي في الدرس المفتوح مش محفوظة. تكمل؟')

  const open = (lesson: DictationLesson) => {
    const next: Draft = { id: lesson.id, subjectId: lesson.subjectId, title: lesson.title, description: lesson.description }
    setDraft(next)
    setSavedDraft(next)
    setSelectedSubjectId(lesson.subjectId)
    setSave({ status: 'idle' })
    setActive(true)
  }

  const openExisting = (id: string) => {
    const lesson = lessons.find((l) => l.id === id)
    if (!lesson || !confirmDiscard()) return
    open(lesson)
  }

  // Type a lesson name: open it if it already exists in the subject, otherwise start a new lesson with that name.
  const startFromName = () => {
    const name = newLessonName.trim()
    if (!name) return
    if (!selectedSubjectId) {
      alert('اختار المادة الأول.')
      return
    }
    const existing = lessonsOf(selectedSubjectId).find((l) => l.title.trim().toLowerCase() === name.toLowerCase())
    if (existing) {
      if (confirmDiscard()) {
        open(existing)
        setNewLessonName('')
      }
      return
    }
    if (!confirmDiscard()) return
    setDraft({ ...emptyDraft, subjectId: selectedSubjectId, title: name })
    setSavedDraft(null)
    setSave({ status: 'idle' })
    setNewLessonName('')
    setActive(true)
  }

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newSubjectName.trim()
    if (!name) return
    setSubjectBusy(true)
    setSubjectError('')
    try {
      const subject = await adminCreateDictationSubject({ name })
      setSubjects((current) => [...current, { ...subject, lessonCount: 0 }].sort(byOrder))
      setSelectedSubjectId(subject.id)
      setMoveTargetId(subject.id)
      setNewSubjectName('')
      router.refresh()
    } catch (err) {
      setSubjectError(err instanceof Error ? err.message : 'تعذر إنشاء المادة.')
    } finally {
      setSubjectBusy(false)
    }
  }

  const moveSelectedLesson = async () => {
    const lesson = lessons.find((l) => l.id === moveLessonId)
    if (!lesson || !moveTargetId || moveTargetId === lesson.subjectId) return
    setMove({ status: 'busy' })
    try {
      const updated = await adminUpdateDictationLesson(lesson.id, { subjectId: moveTargetId })
      setLessons((current) => current.map((l) => (l.id === updated.id ? updated : l)))
      if (draft.id === updated.id) {
        setDraft((d) => ({ ...d, subjectId: updated.subjectId }))
        setSavedDraft((d) => (d ? { ...d, subjectId: updated.subjectId } : d))
        setSelectedSubjectId(updated.subjectId)
      }
      setMove({ status: 'done', message: 'اتنقل الدرس.' })
      router.refresh()
    } catch (err) {
      setMove({ status: 'error', message: err instanceof Error ? err.message : 'تعذر نقل الدرس.' })
    }
  }

  const saveLesson = async () => {
    const title = draft.title.trim()
    if (!title) {
      alert('اكتب عنوان الدرس الأول.')
      return
    }
    if (!draft.subjectId) {
      alert('اختار المادة الأول.')
      return
    }
    setSave({ status: 'busy' })
    try {
      const description = draft.description.trim()
      const lesson = draft.id
        ? await adminUpdateDictationLesson(draft.id, { title, description, subjectId: draft.subjectId })
        : await adminCreateDictationLesson({ subjectId: draft.subjectId, title, description })
      setLessons((current) =>
        current.some((l) => l.id === lesson.id) ? current.map((l) => (l.id === lesson.id ? lesson : l)) : [...current, lesson],
      )
      const next: Draft = { id: lesson.id, subjectId: lesson.subjectId, title: lesson.title, description: lesson.description }
      setDraft(next)
      setSavedDraft(next)
      setSave({ status: 'done', message: 'اتحفظ الدرس.' })
      router.refresh()
    } catch (err) {
      setSave({ status: 'error', message: err instanceof Error ? err.message : 'تعذر الحفظ.' })
    }
  }

  const clearLesson = async () => {
    const message = draft.id
      ? 'الدرس المحفوظ هيتمسح نهائيًا بكل محتواه. تكمل؟'
      : 'تمسح بيانات الدرس الجديد؟'
    if (!confirm(message)) return
    setRemoving(true)
    try {
      if (draft.id) {
        await adminDeleteDictationLesson(draft.id)
        setLessons((current) => current.filter((l) => l.id !== draft.id))
        router.refresh()
      }
      setDraft(emptyDraft)
      setSavedDraft(null)
      setSave({ status: 'idle' })
      setActive(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر مسح الدرس.')
    } finally {
      setRemoving(false)
    }
  }

  const selectedLessons = lessonsOf(selectedSubjectId)
  const moveTarget = lessons.find((l) => l.id === moveLessonId)

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {loadError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">تعذر تحميل بيانات التسميع بالكتابة.</p>
            <p className="text-xs text-muted-foreground">
              لو الـ migration لسه ما اتطبقش، شغّل ملف <span dir="ltr">supabase/migrations/20261024000000_dictation.sql</span> على
              Supabase وبعدين حدّث الصفحة. الفلاش كاردس مش متأثر.
            </p>
            <p className="text-xs text-muted-foreground" dir="ltr">{loadError}</p>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            اختار المادة
            <select
              className={inputClass}
              value={selectedSubjectId}
              disabled={busy}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value)
                setMove({ status: 'idle' })
              }}
            >
              <option value="">اختار المادة…</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} ({lessonsOf(subject.id).length} دروس)
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            وبعدين اختار الدرس اللي هتعدله
            <select
              className={inputClass}
              value=""
              disabled={!selectedSubjectId || busy}
              onChange={(e) => openExisting(e.target.value)}
            >
              <option value="">اختار الدرس…</option>
              {selectedLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            انقل أي درس محفوظ
            <select
              className={inputClass}
              value={moveLessonId}
              disabled={busy}
              onChange={(e) => {
                setMoveLessonId(e.target.value)
                setMove({ status: 'idle' })
              }}
            >
              <option value="">اختار الدرس…</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title} — {subjectName(lesson.subjectId)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            المادة الجديدة
            <select
              className={inputClass}
              value={moveTargetId}
              disabled={busy}
              onChange={(e) => {
                setMoveTargetId(e.target.value)
                setMove({ status: 'idle' })
              }}
            >
              <option value="">اختار المادة…</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={moveSelectedLesson}
            disabled={!moveTarget || !moveTargetId || moveTarget.subjectId === moveTargetId || busy}
          >
            <ArrowRightLeft aria-hidden />
            {moving ? 'بينقل…' : 'نقل الدرس'}
          </Button>
          {move.status === 'done' && <span role="status" className="text-xs text-success sm:col-span-3">{move.message}</span>}
          {move.status === 'error' && <span role="alert" className="text-xs text-destructive sm:col-span-3">{move.message}</span>}
        </div>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            startFromName()
          }}
        >
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            أو اكتب اسم درس في المادة المختارة
            <input
              className={inputClass}
              value={newLessonName}
              disabled={!selectedSubjectId || busy}
              maxLength={DICTATION_LIMITS.lessonTitle}
              onChange={(e) => setNewLessonName(e.target.value)}
              placeholder="اسم الدرس الجديد"
            />
          </label>
          <Button type="submit" size="sm" disabled={!selectedSubjectId || !newLessonName.trim() || busy}>
            فتح / إنشاء
          </Button>
        </form>

        <form className="flex flex-wrap items-end gap-2 border-t pt-3" onSubmit={addSubject}>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            إنشاء مادة
            <input
              className={inputClass}
              value={newSubjectName}
              disabled={subjectBusy}
              maxLength={DICTATION_LIMITS.subjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="مثلًا: الفسيولوجي"
            />
          </label>
          <Button type="submit" size="sm" disabled={!newSubjectName.trim() || subjectBusy}>
            {subjectBusy ? 'بينشئ…' : 'إنشاء مادة'}
          </Button>
          {subjectError && <p role="alert" className="w-full text-xs text-destructive">{subjectError}</p>}
        </form>
      </section>

      {active && (
        <>
          <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              عنوان الدرس
              <input
                className={inputClass}
                value={draft.title}
                maxLength={DICTATION_LIMITS.lessonTitle}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="مثلًا: دورة القلب"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              وصف مختصر
              <input
                className={inputClass}
                value={draft.description}
                maxLength={DICTATION_LIMITS.lessonDescription}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="مثلًا: الفصول من 9 إلى 12"
              />
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              المادة: <span className="font-semibold text-foreground">{subjectName(draft.subjectId)}</span>
              {!draft.id && ' · درس جديد لسه ما اتحفظش'}
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button size="sm" onClick={saveLesson} disabled={!draft.title.trim() || busy}>
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : <CloudUpload aria-hidden />} حفظ الدرس
              </Button>
              <Button variant="destructive" size="sm" onClick={clearLesson} disabled={busy}>
                <Eraser aria-hidden /> {draft.id ? 'مسح الدرس' : 'تجاهل'}
              </Button>
              <p className="text-xs" role="status" aria-live="polite">
                {save.status === 'done' && <span className="text-primary">{save.message}</span>}
                {save.status === 'error' && <span className="text-destructive">تعذر الحفظ: {save.message}</span>}
              </p>
            </div>
          </section>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section data-testid="dictation-editor" className="min-w-0">
              <WordEditor key={draft.id ?? 'new'} onTextChange={() => {}} placeholder="اكتب هنا…" />
            </section>
            {/* مساحة فاضية جنب المحرر لحاجة هتتضاف بعدين */}
            <aside data-testid="dictation-side-slot" className="min-w-0" />
          </div>
        </>
      )}
    </div>
  )
}
