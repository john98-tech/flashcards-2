'use client'

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronLeft, ChevronRight, FilePlus2, FileX2 } from 'lucide-react'
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'

const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then((module) => module.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-3 bg-white text-sm text-muted-foreground">
        <span className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" aria-hidden />
        بيجهز مساحة الكتابة…
      </div>
    ),
  },
)

type PageElements = ReturnType<ExcalidrawImperativeAPI['getSceneElementsIncludingDeleted']>
type ChangeHandler = NonNullable<ExcalidrawProps['onChange']>

type Page = {
  id: number
  elements: PageElements
  files: BinaryFileData[]
  background: string
}

export type DictationAnswer = {
  pages: { number: number; text: string; image?: string }[]
}

export type DrawingBoardHandle = {
  getAnswer: () => Promise<DictationAnswer>
  clear: () => void
}

const EMPTY_ELEMENTS: PageElements = []
const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false as const,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
}

export const DrawingBoard = forwardRef<DrawingBoardHandle>(function DrawingBoard(_, ref) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const pagesRef = useRef<Page[]>([{ id: 0, elements: EMPTY_ELEMENTS, files: [], background: '#ffffff' }])
  const currentPageRef = useRef(0)
  const nextPageIdRef = useRef(1)
  const isSwitchingRef = useRef(false)
  const [pages, setPages] = useState([{ id: 0, hasContent: false }])
  const [currentPage, setCurrentPage] = useState(0)
  const [isSwitching, setIsSwitching] = useState(false)

  const saveCurrentPage = useCallback((
    elements: PageElements,
    appState: AppState | undefined = apiRef.current?.getAppState(),
    files: BinaryFiles | undefined = apiRef.current?.getFiles(),
  ) => {
    const page = pagesRef.current[currentPageRef.current]
    if (!page) return
    page.elements = elements
    page.files = files ? Object.values(files) : []
    page.background = appState?.viewBackgroundColor ?? '#ffffff'

    const hasContent = elements.some((element) => !element.isDeleted)
    setPages((current) => current.map((item, index) =>
      index === currentPageRef.current && item.hasContent !== hasContent
        ? { ...item, hasContent }
        : item,
    ))
  }, [])

  const handleChange: ChangeHandler = useCallback((elements, appState, files) => {
    if (!isSwitchingRef.current) saveCurrentPage(elements, appState, files)
  }, [saveCurrentPage])

  const switchPage = useCallback(async (nextIndex: number) => {
    const api = apiRef.current
    const page = pagesRef.current[nextIndex]
    if (!api || !page || isSwitchingRef.current || nextIndex === currentPageRef.current) return

    const current = pagesRef.current[currentPageRef.current]
    current.elements = api.getSceneElementsIncludingDeleted()
    current.files = Object.values(api.getFiles())
    current.background = api.getAppState().viewBackgroundColor

    isSwitchingRef.current = true
    setIsSwitching(true)
    try {
      if (page.files.length) api.addFiles(page.files)
      api.updateScene({
        elements: page.elements,
        appState: { viewBackgroundColor: page.background },
      })
      api.history.clear()
      currentPageRef.current = nextIndex
      setCurrentPage(nextIndex)
      setPages((currentPages) => currentPages.map((item, index) => ({
        ...item,
        hasContent: index === nextIndex
          ? page.elements.some((element) => !element.isDeleted)
          : currentPages[index].hasContent,
      })))
    } finally {
      requestAnimationFrame(() => {
        isSwitchingRef.current = false
        setIsSwitching(false)
      })
    }
  }, [])

  const addPage = useCallback(() => {
    if (isSwitchingRef.current) return
    const id = nextPageIdRef.current++
    pagesRef.current.push({ id, elements: EMPTY_ELEMENTS, files: [], background: '#ffffff' })
    setPages((current) => [...current, { id, hasContent: false }])
    void switchPage(pagesRef.current.length - 1)
  }, [switchPage])

  const deletePage = useCallback(() => {
    if (pagesRef.current.length < 2 || isSwitchingRef.current) return
    if (!confirm(`تحذف الصفحة ${currentPageRef.current + 1} بكل اللي فيها؟`)) return
    pagesRef.current.splice(currentPageRef.current, 1)
    const nextIndex = Math.min(currentPageRef.current, pagesRef.current.length - 1)
    setPages((current) => current.filter((_, index) => index !== currentPageRef.current))
    currentPageRef.current = nextIndex
    setCurrentPage(nextIndex)
    const api = apiRef.current
    const page = pagesRef.current[nextIndex]
    if (!api || !page) return
    isSwitchingRef.current = true
    setIsSwitching(true)
    if (page.files.length) api.addFiles(page.files)
    api.updateScene({
      elements: page.elements,
      appState: { viewBackgroundColor: page.background },
    })
    api.history.clear()
    requestAnimationFrame(() => {
      isSwitchingRef.current = false
      setIsSwitching(false)
    })
  }, [])

  useImperativeHandle(ref, () => ({
    async getAnswer() {
      const api = apiRef.current
      if (!api) return { pages: [] }
      saveCurrentPage(api.getSceneElementsIncludingDeleted())

      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const answerPages: DictationAnswer['pages'] = []
      for (const [index, page] of pagesRef.current.entries()) {
        const elements = page.elements.filter((element) => !element.isDeleted)
        if (!elements.length) continue
        const text = elements
          .filter((element) => element.type === 'text')
          .map((element) => element.text.trim())
          .filter(Boolean)
          .join('\n')
        const blob = await exportToBlob({
          elements,
          appState: {
            ...api.getAppState(),
            exportBackground: true,
            viewBackgroundColor: page.background,
          },
          files: Object.fromEntries(page.files.map((file) => [file.id, file])),
          mimeType: 'image/jpeg',
          quality: 0.8,
          maxWidthOrHeight: 1400,
        })
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => typeof reader.result === 'string'
            ? resolve(reader.result.split(',')[1])
            : reject(new Error('تعذر قراءة صورة الصفحة.'))
          reader.onerror = () => reject(reader.error ?? new Error('تعذر قراءة صورة الصفحة.'))
          reader.readAsDataURL(blob)
        })
        answerPages.push({ number: index + 1, text, image })
      }
      return { pages: answerPages }
    },
    clear() {
      apiRef.current?.updateScene({ elements: [] })
    },
  }), [saveCurrentPage])

  return (
    <div className="dictation-board flex h-full min-h-[480px] flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_24px_80px_-38px_rgba(21,92,92,0.42)] ring-1 ring-black/[0.035]">
      <div className="relative z-10 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-l from-white via-white to-teal-50/80 px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-teal-700 text-white shadow-md shadow-teal-900/15">
            <span className="size-3 rounded-full border-2 border-white/90" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">دفتر الإجابة</p>
            <p className="text-xs text-slate-500">مساحة هادئة لكتابة أفكارك ورسمها</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 p-1 shadow-sm">
          <button
            type="button"
            onClick={() => void switchPage(currentPage - 1)}
            disabled={currentPage === 0 || isSwitching}
            aria-label="الصفحة السابقة"
            className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-teal-50 hover:text-teal-800 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <div className="min-w-24 px-1 text-center" aria-live="polite">
            <span className="text-xs font-semibold text-slate-800">صفحة {currentPage + 1}</span>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="text-xs text-slate-500">{pages.length}</span>
          </div>
          <button
            type="button"
            onClick={() => void switchPage(currentPage + 1)}
            disabled={currentPage >= pages.length - 1 || isSwitching}
            aria-label="الصفحة التالية"
            className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-teal-50 hover:text-teal-800 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <button
            type="button"
            onClick={addPage}
            disabled={isSwitching}
            title="إضافة صفحة"
            aria-label="إضافة صفحة"
            className="inline-flex size-8 items-center justify-center rounded-lg bg-teal-700 text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
          >
            <FilePlus2 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={deletePage}
            disabled={pages.length < 2 || isSwitching}
            title="حذف الصفحة الحالية"
            aria-label="حذف الصفحة الحالية"
            className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-30"
          >
            <FileX2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-[#f5f7f7] p-1.5 sm:p-3">
        <div className="pointer-events-none absolute inset-3 rounded-2xl bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.09),_transparent_55%)]" />
        <div className="relative h-full overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm">
          <Excalidraw
            excalidrawAPI={(api) => { apiRef.current = api }}
            onChange={handleChange}
            langCode="ar-SA"
            theme="light"
            name="التسميع بالكتابة"
            zenModeEnabled
            UIOptions={UI_OPTIONS}
            renderTopRightUI={(isMobile) => (
              <button
                type="button"
                onClick={() => {
                  if (confirm('تمسح كل اللي كتبته ورسمته في الصفحة دي؟')) apiRef.current?.updateScene({ elements: [] })
                }}
                className={`rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 ${isMobile ? 'mr-2' : ''}`}
              >
                مسح الصفحة
              </button>
            )}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-slate-200/70 bg-white px-3 py-2">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            onClick={() => void switchPage(index)}
            disabled={isSwitching}
            aria-label={`الانتقال إلى الصفحة ${index + 1}`}
            aria-current={index === currentPage ? 'page' : undefined}
            className={`group flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-all ${
              index === currentPage
                ? 'bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-700/15'
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <span className={`size-1.5 rounded-full transition-colors ${page.hasContent ? 'bg-teal-500' : 'bg-slate-300 group-hover:bg-slate-400'}`} />
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  )
})
