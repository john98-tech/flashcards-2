'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, CloudUpload, Eraser, ImagePlus, Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { WordEditor } from '@/components/admin/word-editor'
import {
  adminCreateDictationLesson,
  adminCreateDictationSubject,
  adminDeleteDictationLesson,
  adminLoadDictationLesson,
  adminCreateDictationStudentImageUpload,
  adminSaveDictationGradingPrompt,
  adminSaveDictationReferenceText,
  adminSaveDictationStudentMaterial,
  adminUpdateDictationLesson,
} from '@/app/admin/dictation-actions'
import {
  DEFAULT_DICTATION_GRADING_PROMPT,
  DICTATION_LIMITS,
  DICTATION_PDF_BUCKET,
  type DictationLesson,
  type DictationStudentImage,
  type DictationSubjectSummary,
  type ReferenceKind,
} from '@/lib/dictation/types'

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
const promptForEditor = (saved: string) => {
  if (!saved.trim()) return DEFAULT_DICTATION_GRADING_PROMPT
  if (saved.startsWith(DEFAULT_DICTATION_GRADING_PROMPT)) return saved
  return `${DEFAULT_DICTATION_GRADING_PROMPT}\n\nتعليمات إضافية لهذا الدرس:\n${saved}`
}

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
  // Editor content (the lesson's reference text) and its load state.
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [initialContent, setInitialContent] = useState('')
  const [prompt, setPrompt] = useState('')
  const [savedPrompt, setSavedPrompt] = useState('')
  const [studentText, setStudentText] = useState('')
  const [savedStudentText, setSavedStudentText] = useState('')
  const [studentImages, setStudentImages] = useState<DictationStudentImage[]>([])
  const [savedStudentImages, setSavedStudentImages] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [refKind, setRefKind] = useState<ReferenceKind>('none')
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState('')
  const [editorSession, setEditorSession] = useState(0)
  const loadSeq = useRef(0)
  const [draftReady, setDraftReady] = useState(false)
  const draftStorageKey = 'sammaa-dictation-admin-draft-v1'

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey)
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>
        if (saved.draft && typeof saved.draft === 'object') setDraft(saved.draft as Draft)
        if (saved.savedDraft && typeof saved.savedDraft === 'object') setSavedDraft(saved.savedDraft as Draft)
        if (typeof saved.active === 'boolean') setActive(saved.active)
        if (typeof saved.selectedSubjectId === 'string') setSelectedSubjectId(saved.selectedSubjectId)
        if (typeof saved.moveLessonId === 'string') setMoveLessonId(saved.moveLessonId)
        if (typeof saved.moveTargetId === 'string') setMoveTargetId(saved.moveTargetId)
        if (typeof saved.newLessonName === 'string') setNewLessonName(saved.newLessonName)
        if (typeof saved.newSubjectName === 'string') setNewSubjectName(saved.newSubjectName)
        if (typeof saved.content === 'string') setContent(saved.content)
        if (typeof saved.savedContent === 'string') setSavedContent(saved.savedContent)
        if (typeof saved.initialContent === 'string') setInitialContent(saved.initialContent)
        if (typeof saved.prompt === 'string') setPrompt(saved.prompt)
        if (typeof saved.savedPrompt === 'string') setSavedPrompt(saved.savedPrompt)
        if (typeof saved.studentText === 'string') setStudentText(saved.studentText)
        if (typeof saved.savedStudentText === 'string') setSavedStudentText(saved.savedStudentText)
        if (Array.isArray(saved.studentImages)) setStudentImages(saved.studentImages as DictationStudentImage[])
        if (typeof saved.savedStudentImages === 'string') setSavedStudentImages(saved.savedStudentImages)
        if (saved.refKind === 'none' || saved.refKind === 'text' || saved.refKind === 'pdf') setRefKind(saved.refKind)
      }
    } catch {}
    setDraftReady(true)
  }, [])

  useEffect(() => {
    if (!draftReady) return
    try {
      const hasWork = active || !!draft.id || !!content || !!prompt || !!studentText || !!newLessonName || !!newSubjectName
      if (!hasWork) {
        localStorage.removeItem(draftStorageKey)
        return
      }
      localStorage.setItem(draftStorageKey, JSON.stringify({
        draft, savedDraft, active, selectedSubjectId, moveLessonId, moveTargetId, newLessonName, newSubjectName,
        content, savedContent, initialContent, prompt, savedPrompt, studentText, savedStudentText,
        studentImages, savedStudentImages, refKind, savedAt: Date.now(),
      }))
    } catch {}
  }, [draftReady, draft, savedDraft, active, selectedSubjectId, moveLessonId, moveTargetId, newLessonName, newSubjectName, content, savedContent, initialContent, prompt, savedPrompt, studentText, savedStudentText, studentImages, savedStudentImages, refKind])

  // Keep local lists in step with the server after router.refresh().
  useEffect(() => setSubjects(initialSubjects), [initialSubjects])
  useEffect(() => setLessons(initialLessons), [initialLessons])

  const saving = save.status === 'busy'
  const moving = move.status === 'busy'
  const busy = saving || moving || removing || imageUploading
  const contentDirty = content !== savedContent
  const promptDirty = prompt !== savedPrompt
  const studentDirty =
    studentText !== savedStudentText ||
    JSON.stringify(studentImages.map(({ path, name }) => ({ path, name }))) !== savedStudentImages
  const dirty =
    active &&
    (!savedDraft || JSON.stringify(savedDraft) !== JSON.stringify(draft) || contentDirty || promptDirty || studentDirty)
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
    loadContent(lesson.id)
  }

  // Loads the lesson's saved editor text. The editor only mounts once it is loaded, so a failed load can never overwrite it.
  const loadContent = (lessonId: string) => {
    const seq = ++loadSeq.current
    setContent('')
    setSavedContent('')
    setInitialContent('')
    setRefKind('none')
    setPrompt('')
    setSavedPrompt('')
    setStudentText('')
    setSavedStudentText('')
    setStudentImages([])
    setSavedStudentImages('[]')
    setImageError('')
    setContentError('')
    setContentLoading(true)
    setEditorSession((n) => n + 1)
    adminLoadDictationLesson(lessonId)
      .then((result) => {
        if (seq !== loadSeq.current) return
        if (!result.ok) {
          setContentError(result.error)
          return
        }
        const full = result.lesson
        const kind = full?.reference.kind ?? 'none'
        const text = kind === 'text' ? full?.reference.text ?? '' : ''
        setRefKind(kind)
        setInitialContent(text)
        setContent(text)
        setSavedContent(text)
        const savedPrompt = promptForEditor(full?.reference.prompt ?? '')
        setPrompt(savedPrompt)
        setSavedPrompt(savedPrompt)
        const material = full?.studentMaterial
        setStudentText(material?.text ?? '')
        setSavedStudentText(material?.text ?? '')
        setStudentImages(material?.images ?? [])
        setSavedStudentImages(JSON.stringify((material?.images ?? []).map(({ path, name }) => ({ path, name }))))
      })
      .catch((err) => {
        if (seq === loadSeq.current) setContentError(err instanceof Error ? err.message : 'تعذر تحميل محتوى الدرس.')
      })
      .finally(() => {
        if (seq === loadSeq.current) setContentLoading(false)
      })
  }

  const resetContent = () => {
    loadSeq.current++
    setContent('')
    setSavedContent('')
    setInitialContent('')
    setPrompt(DEFAULT_DICTATION_GRADING_PROMPT)
    setSavedPrompt('')
    setStudentText('')
    setSavedStudentText('')
    setStudentImages([])
    setSavedStudentImages('[]')
    setImageError('')
    setRefKind('none')
    setContentError('')
    setContentLoading(false)
    setEditorSession((n) => n + 1)
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
    resetContent()
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
      const result = await adminUpdateDictationLesson(lesson.id, { subjectId: moveTargetId })
      if (!result.ok) throw new Error(result.error)
      const updated = result.value
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
    if (contentDirty && refKind === 'pdf' && content.trim() && !confirm('الدرس ده مرجعه ملف PDF، والنص اللي كتبته هيحل محله. تكمل؟')) return
    setSave({ status: 'busy' })
    try {
      const description = draft.description.trim()
      const lessonResult = draft.id
        ? await adminUpdateDictationLesson(draft.id, { title, description, subjectId: draft.subjectId })
        : await adminCreateDictationLesson({ subjectId: draft.subjectId, title, description })
      if (!lessonResult.ok) throw new Error(lessonResult.error)
      const lesson = lessonResult.value
      setLessons((current) =>
        current.some((l) => l.id === lesson.id) ? current.map((l) => (l.id === lesson.id ? lesson : l)) : [...current, lesson],
      )
      const next: Draft = { id: lesson.id, subjectId: lesson.subjectId, title: lesson.title, description: lesson.description }
      setDraft(next)
      setSavedDraft(next)
      if (contentDirty) {
        const result = await adminSaveDictationReferenceText(lesson.id, content)
        if (!result.ok) throw new Error(result.error)
        const reference = result.value
        setRefKind(reference.kind)
        setSavedContent(content)
      }
      if (promptDirty) {
        const result = await adminSaveDictationGradingPrompt(lesson.id, prompt)
        if (!result.ok) throw new Error(result.error)
        const reference = result.value
        setPrompt(reference.prompt)
        setSavedPrompt(reference.prompt)
      }
      if (studentDirty) {
        const result = await adminSaveDictationStudentMaterial(
          lesson.id,
          studentText,
          studentImages.map(({ path, name }) => ({ path, name })),
        )
        if (!result.ok) throw new Error(result.error)
        setSavedStudentText(studentText)
        setSavedStudentImages(JSON.stringify(studentImages.map(({ path, name }) => ({ path, name }))))
      }
      setSave({ status: 'done', message: 'اتحفظ الدرس.' })
      router.refresh()
    } catch (err) {
      setSave({ status: 'error', message: err instanceof Error ? err.message : 'تعذر الحفظ.' })
    }
  }

  const uploadStudentImages = async (files: FileList | null) => {
    if (!files?.length || !draft.id) return
    const selected = Array.from(files)
    if (studentImages.length + selected.length > DICTATION_LIMITS.studentImagesPerLesson) {
      setImageError(`الحد الأقصى ${DICTATION_LIMITS.studentImagesPerLesson} صورة للدرس.`)
      return
    }
    setImageUploading(true)
    setImageError('')
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      for (const file of selected) {
        const signed = await adminCreateDictationStudentImageUpload(draft.id, {
          name: file.name,
          contentType: file.type,
          size: file.size,
        })
        const { error } = await supabase.storage
          .from(DICTATION_PDF_BUCKET)
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, upsert: false })
        if (error) throw new Error(`تعذر رفع ${file.name}: ${error.message}`)
        setStudentImages((current) => [...current, { path: signed.path, name: file.name, url: '' }])
      }
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'تعذر رفع الصور.')
    } finally {
      setImageUploading(false)
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
      resetContent()
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
              {contentLoading && (
                <p className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> بيحمّل محتوى الدرس…
                </p>
              )}
              {contentError && (
                <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  تعذر تحميل محتوى الدرس: {contentError}. افتح الدرس تاني.
                </p>
              )}
              {!contentLoading && !contentError && (
                <div className="flex flex-col gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">النص المرجعي للتصحيح</h2>
                    <p className="text-xs text-muted-foreground">ده النص اللي Gemini هيعتمد عليه، ومش بيظهر للطالب.</p>
                  </div>
                  <WordEditor
                    key={editorSession}
                    initialText={initialContent}
                    onTextChange={setContent}
                    placeholder="اكتب النص المرجعي هنا…"
                  />
                </div>
              )}
            </section>
            <aside data-testid="dictation-side-slot" className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 lg:sticky lg:top-4">
              <section className="flex flex-col gap-2">
                <label htmlFor="dictation-student-material" className="flex flex-col gap-1 text-sm font-semibold">
                  العناوين والمحتوى الظاهر للطالب
                  <span className="text-xs font-normal text-muted-foreground">
                    اكتب العناوين الثابتة أو التعليمات التي تظهر في صفحة التسميع. هذا المحتوى منفصل عن مرجع Gemini.
                  </span>
                </label>
                <textarea
                  id="dictation-student-material"
                  className={`${inputClass} min-h-48 resize-y leading-7`}
                  value={studentText}
                  maxLength={DICTATION_LIMITS.referenceText}
                  disabled={contentLoading || !!contentError || busy}
                  onChange={(e) => setStudentText(e.target.value)}
                  placeholder="اكتب العناوين أو المحتوى الذي تريد إظهاره للطالب…"
                  dir="auto"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
                    <ImagePlus className="size-4" aria-hidden />
                    {imageUploading ? 'بيرفع الصور…' : 'إضافة صور للطالب'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      disabled={!draft.id || imageUploading || busy}
                      onChange={(e) => {
                        void uploadStudentImages(e.target.files)
                        e.currentTarget.value = ''
                      }}
                      className="sr-only"
                    />
                  </label>
                  {!draft.id && <span className="text-xs text-muted-foreground">احفظ الدرس أولًا لإضافة الصور.</span>}
                  <span className="text-xs text-muted-foreground">{studentImages.length} صورة</span>
                </div>
                {studentImages.length > 0 && (
                  <ul className="space-y-1">
                    {studentImages.map((image) => (
                      <li key={image.path} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs">
                        <span className="truncate" dir="auto">{image.name}</span>
                        <button
                          type="button"
                          aria-label={`حذف صورة ${image.name}`}
                          title="إزالة الصورة"
                          disabled={busy || imageUploading}
                          onClick={() => setStudentImages((current) => current.filter((item) => item.path !== image.path))}
                          className="shrink-0 rounded p-1 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {imageError && <p role="alert" className="text-xs text-destructive">{imageError}</p>}
              </section>
              <section className="flex flex-col gap-2 border-t pt-3">
              <label htmlFor="dictation-grading-prompt" className="flex flex-col gap-2 text-sm font-semibold">
                برومبت Gemini للتصحيح
                <span className="text-xs font-normal text-muted-foreground">
                  يبدأ بالبرومبت الافتراضي. عدّل النص هنا لتغيير تعليمات Gemini لهذا الدرس؛ اتركه كما هو لاستخدام الإعداد الافتراضي.
                </span>
              </label>
              <textarea
                id="dictation-grading-prompt"
                className={`${inputClass} min-h-64 resize-y leading-7`}
                value={prompt}
                maxLength={DICTATION_LIMITS.gradingPrompt}
                disabled={contentLoading || !!contentError || busy}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={DEFAULT_DICTATION_GRADING_PROMPT}
                dir="auto"
              />
              <p className="text-xs text-muted-foreground">{prompt.length.toLocaleString()} حرف</p>
              <p className="text-xs font-semibold">مرجع Gemini: النص المرجعي المكتوب في الخانة المقابلة.</p>
              <Button onClick={saveLesson} disabled={!draft.title.trim() || busy || imageUploading || contentLoading || !!contentError}>
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : <CloudUpload aria-hidden />} حفظ
              </Button>
              <p className="text-xs" role="status" aria-live="polite">
                {save.status === 'done' && <span className="text-primary">{save.message}</span>}
                {save.status === 'error' && <span className="text-destructive">تعذر الحفظ: {save.message}</span>}
                {save.status !== 'done' && save.status !== 'error' && dirty && (
                  <span className="text-muted-foreground">فيه تعديلات لسه ما اتحفظتش.</span>
                )}
              </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
