'use client'

import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import dynamic from 'next/dynamic'
import { ChevronLeft, ChevronRight, FilePlus2, FileX2, Redo2, Undo2 } from 'lucide-react'
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types'
import type { FileId } from '@excalidraw/excalidraw/element/types'
import { convertToExcalidrawElements, exportToBlob, getCommonBounds, getDataURL } from '@excalidraw/excalidraw'
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

// لقطة التراجع بتحتفظ بالصورة كـ Blob (بره الـ JS heap) بدل نص base64 تقيل.
type PageSnapshot = {
  elements: PageElements
  image: Blob | null
}

type Page = {
  id: number
  elements: PageElements
  files: BinaryFileData[]
  background: string
  history: PageSnapshot[]
  historyIndex: number
}

export type DictationAnswer = {
  pages: { number: number; text: string; image?: string }[]
}

export type DrawingBoardHandle = {
  getAnswer: () => Promise<DictationAnswer>
  clear: () => void
}

const EMPTY_ELEMENTS: PageElements = []
const EMPTY_SNAPSHOT: PageSnapshot = { elements: EMPTY_ELEMENTS, image: null }
const MAX_UNDO_STEPS = 10
const MAX_HISTORY_SNAPSHOTS = MAX_UNDO_STEPS + 1
const FLATTEN_DEBOUNCE_MS = 900
// هامش حوالين الرسم عشان سمك الخط ما يتقصش عند الأطراف.
const FLATTEN_PADDING = 24
// حدود دقة الصورة المدمجة: دقة أعلى = خط أنضف مع الزوم، بس بتاخد رام أكتر.
const MAX_BITMAP_SCALE = 3
const MAX_BITMAP_PIXELS = 8_000_000
const MAX_BITMAP_SIDE = 8192

const flatFileId = (pageId: number) => `dictation-page-${pageId}` as FileId

const visibleKey = (elements: PageElements) => elements
  .filter((element) => !element.isDeleted)
  .map((element) => `${element.id}:${element.version}`)
  .join('|')

const snapshotFileId = (elements: PageElements) => {
  for (const element of elements) {
    if (!element.isDeleted && element.type === 'image' && element.fileId) return element.fileId
  }
  return null
}

// بنختار أعلى دقة (أرقام صحيحة) تدخل في حد الرام، عشان البكسلات تفضل متطابقة مع كل دمج
// ومفيش تشويش بيتراكم.
const pickBitmapScale = (width: number, height: number) => {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  let scale = Math.min(MAX_BITMAP_SCALE, Math.max(2, Math.ceil(dpr)))
  const fits = (s: number) =>
    width * s * height * s <= MAX_BITMAP_PIXELS && Math.max(width, height) * s <= MAX_BITMAP_SIDE
  while (scale > 1 && !fits(scale)) scale -= 1
  if (fits(scale)) return scale
  return Math.min(1, Math.sqrt(MAX_BITMAP_PIXELS / (width * height)), MAX_BITMAP_SIDE / Math.max(width, height))
}

// Excalidraw مبيسمحش بتحديث ملف موجود بنفس الـ id، ومبيمسحش الكاش القديم أبدًا.
// فبنمسح الملف القديم من الـ store ونضيفه تاني، وده بيفرّغ الصورة القديمة من الكاش.
const replaceFiles = (api: ExcalidrawImperativeAPI, files: BinaryFileData[]) => {
  if (!files.length) return
  const store = api.getFiles()
  for (const file of files) delete store[file.id]
  api.addFiles(files)
}
const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: true,
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
  const pagesRef = useRef<Page[]>([{
    id: 0,
    elements: EMPTY_ELEMENTS,
    files: [],
    background: '#ffffff',
    history: [EMPTY_SNAPSHOT],
    historyIndex: 0,
  }])
  const currentPageRef = useRef(0)
  const nextPageIdRef = useRef(1)
  const isSwitchingRef = useRef(false)
  const flattenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flatteningRef = useRef(false)
  const historyQueueRef = useRef<Promise<void>>(Promise.resolve())
  const sceneRevisionRef = useRef(0)
  const flattenedSignatureRef = useRef('')
  const [pages, setPages] = useState([{ id: 0, hasContent: false }])
  const [currentPage, setCurrentPage] = useState(0)
  const [isSwitching, setIsSwitching] = useState(false)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [brushColor, setBrushColor] = useState('#0f766e')
  const [brushSize, setBrushSize] = useState(2)
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')
  const brushColorRef = useRef(brushColor)
  const brushSizeRef = useRef(brushSize)
  const backgroundColorRef = useRef(backgroundColor)

  const sceneSignature = (elements: PageElements) => elements
    .map((element) => `${element.id}:${element.version}:${element.isDeleted ? 1 : 0}`)
    .join('|')

  const updateHistoryState = useCallback((page: Page) => {
    setHistoryState({
      canUndo: page.historyIndex > 0,
      canRedo: page.historyIndex < page.history.length - 1,
    })
  }, [])

  const saveCurrentPage = useCallback((
    elements: PageElements,
    appState: AppState | undefined = apiRef.current?.getAppState(),
    files: BinaryFiles | undefined = apiRef.current?.getFiles(),
  ) => {
    const page = pagesRef.current[currentPageRef.current]
    if (!page) return
    page.elements = elements
    const usedFileIds = new Set(elements.flatMap((element) =>
      element.type === 'image' && !element.isDeleted && element.fileId ? [element.fileId] : [],
    ))
    page.files = files ? Object.values(files).filter((file) => usedFileIds.has(file.id)) : []
    page.background = appState?.viewBackgroundColor ?? '#ffffff'

    const hasContent = elements.some((element) => !element.isDeleted)
    setPages((current) => {
      const index = currentPageRef.current
      const item = current[index]
      if (!item || item.hasContent === hasContent) return current
      const next = current.slice()
      next[index] = { ...item, hasContent }
      return next
    })
  }, [])

  const handleChange: ChangeHandler = useCallback((elements, appState, files) => {
    if (!isSwitchingRef.current) {
      sceneRevisionRef.current += 1
      saveCurrentPage(elements, appState, files)
      if (brushColorRef.current !== appState.currentItemStrokeColor) {
        brushColorRef.current = appState.currentItemStrokeColor
        setBrushColor(appState.currentItemStrokeColor)
      }
      if (brushSizeRef.current !== appState.currentItemStrokeWidth) {
        brushSizeRef.current = appState.currentItemStrokeWidth
        setBrushSize(appState.currentItemStrokeWidth)
      }
      if (backgroundColorRef.current !== appState.viewBackgroundColor) {
        backgroundColorRef.current = appState.viewBackgroundColor
        setBackgroundColor(appState.viewBackgroundColor)
      }
    }
  }, [saveCurrentPage])

  const flattenCurrentPage = useCallback(async () => {
    const api = apiRef.current
    const pageIndex = currentPageRef.current
    const page = pagesRef.current[pageIndex]
    if (!api || !page || flatteningRef.current) return

    const elements = api.getSceneElementsIncludingDeleted()
    const visibleElements = elements.filter((element) => !element.isDeleted)
    const signature = sceneSignature(elements)
    if (signature === flattenedSignatureRef.current) return

    // لو اللي ظاهر هو نفس لقطة التراجع الحالية (مثلًا لمسة زوم بصباعين بتعمل عنصر متمسوح)،
    // أو مفيش غير الصورة المدمجة، يبقى مفيش رسم جديد: منعيدش الدمج عشان الجودة ما تقلش
    // وخطوات التراجع الـ10 ما تتاكلش على الفاضي.
    if (
      visibleKey(elements) === visibleKey(page.history[page.historyIndex].elements) ||
      (visibleElements.length > 0 && visibleElements.every((element) => element.type === 'image'))
    ) {
      flattenedSignatureRef.current = signature
      return
    }

    flatteningRef.current = true
    const revision = sceneRevisionRef.current
    try {
      if (!visibleElements.length) {
        const history = page.history.slice(0, page.historyIndex + 1)
        history.push(EMPTY_SNAPSHOT)
        page.history = history.slice(-MAX_HISTORY_SNAPSHOTS)
        page.historyIndex = page.history.length - 1
        page.elements = EMPTY_ELEMENTS
        page.files = []
        api.history.clear()
        flattenedSignatureRef.current = signature
        updateHistoryState(page)
        return
      }

      const appState = api.getAppState()
      const bounds = getCommonBounds(visibleElements)
      // منطقة بأرقام صحيحة + هامش: بتخلّي حواف الحروف ما تتقصش، وبتخلّي الصورة القديمة
      // تتنسخ داخل الجديدة بنفس البكسلات بالظبط (من غير تغبيش).
      const x = Math.floor(bounds[0]) - FLATTEN_PADDING
      const y = Math.floor(bounds[1]) - FLATTEN_PADDING
      const width = Math.ceil(bounds[2]) + FLATTEN_PADDING - x
      const height = Math.ceil(bounds[3]) + FLATTEN_PADDING - y
      const scale = pickBitmapScale(width, height)
      // مستطيل شفاف بيثبّت حجم التصدير على المنطقة دي بالظبط.
      const [frame] = convertToExcalidrawElements([{
        type: 'rectangle',
        x,
        y,
        width,
        height,
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        roughness: 0,
      }])
      const blob = await exportToBlob({
        elements: [...visibleElements, frame] as typeof visibleElements,
        appState: {
          ...appState,
          exportBackground: true,
          viewBackgroundColor: page.background,
        },
        files: api.getFiles(),
        mimeType: 'image/png',
        exportPadding: 0,
        getDimensions: (w: number, h: number) => ({
          width: Math.max(1, Math.round(w * scale)),
          height: Math.max(1, Math.round(h * scale)),
          scale,
        }),
      })

      if (
        pageIndex !== currentPageRef.current ||
        revision !== sceneRevisionRef.current ||
        sceneSignature(api.getSceneElementsIncludingDeleted()) !== signature
      ) return

      // id ثابت للصفحة: عشان نقدر نبدّل بيانات الصورة ونفرّغ نسختها القديمة من ذاكرة Excalidraw.
      const fileId = flatFileId(page.id)
      const fileData: BinaryFileData = {
        id: fileId,
        dataURL: await getDataURL(blob),
        mimeType: 'image/png',
        created: Date.now(),
      }
      const imageElements = convertToExcalidrawElements([{
        type: 'image',
        x,
        y,
        width,
        height,
        fileId,
        status: 'saved',
      }])
      if (
        pageIndex !== currentPageRef.current ||
        revision !== sceneRevisionRef.current ||
        sceneSignature(api.getSceneElementsIncludingDeleted()) !== signature
      ) return
      const history = page.history.slice(0, page.historyIndex + 1)
      history.push({ elements: imageElements, image: blob })
      if (history.length > MAX_HISTORY_SNAPSHOTS) history.shift()
      page.history = history
      page.historyIndex = history.length - 1

      // الترتيب مهم: نحدّث المشهد الأول عشان الكاش القديم يتمسح لما نبدّل الملف.
      api.updateScene({ elements: imageElements, appState: { currentItemRoughness: 0 } })
      replaceFiles(api, [fileData])
      page.elements = imageElements
      page.files = [fileData]
      api.history.clear()
      api.setActiveTool({ type: 'freedraw', locked: true })
      flattenedSignatureRef.current = sceneSignature(imageElements)
      updateHistoryState(page)
    } finally {
      flatteningRef.current = false
      if (pageIndex === currentPageRef.current) {
        const currentSignature = sceneSignature(api.getSceneElementsIncludingDeleted())
        if (currentSignature !== flattenedSignatureRef.current) {
          if (flattenTimerRef.current) clearTimeout(flattenTimerRef.current)
          flattenTimerRef.current = setTimeout(() => {
            flattenTimerRef.current = null
            void flattenCurrentPage().catch((error: unknown) => {
              console.error('Unable to flatten dictation drawing.', error)
              apiRef.current?.setToast({ message: 'تعذر تجهيز الرسم كطبقة واحدة.' })
            })
          }, FLATTEN_DEBOUNCE_MS)
        }
      }
    }
  }, [updateHistoryState])

  const flushFlatten = useCallback(async () => {
    if (flattenTimerRef.current) {
      clearTimeout(flattenTimerRef.current)
      flattenTimerRef.current = null
    }
    try {
      while (true) {
        while (flatteningRef.current) {
          await new Promise<void>((resolve) => setTimeout(resolve, 16))
        }
        const api = apiRef.current
        if (!api) return false
        const elements = api.getSceneElementsIncludingDeleted()
        if (sceneSignature(elements) === flattenedSignatureRef.current) return true
        await flattenCurrentPage()
      }
    } catch (error) {
      console.error('Unable to flatten dictation drawing.', error)
      apiRef.current?.setToast({ message: 'تعذر تجهيز الرسم كطبقة واحدة.' })
      return false
    }
  }, [flattenCurrentPage])

  const scheduleFlatten = useCallback(() => {
    if (flattenTimerRef.current) clearTimeout(flattenTimerRef.current)
    flattenTimerRef.current = setTimeout(() => {
      flattenTimerRef.current = null
      void flattenCurrentPage().catch((error: unknown) => {
        console.error('Unable to flatten dictation drawing.', error)
        apiRef.current?.setToast({ message: 'تعذر تجهيز الرسم كطبقة واحدة.' })
      })
    }, FLATTEN_DEBOUNCE_MS)
  }, [flattenCurrentPage])

  const stepHistory = useCallback(async (direction: -1 | 1) => {
    if (!(await flushFlatten())) return
    const pageIndex = currentPageRef.current
    const page = pagesRef.current[pageIndex]
    const api = apiRef.current
    if (!page || !api) return
    const nextIndex = page.historyIndex + direction
    if (nextIndex < 0 || nextIndex >= page.history.length) return

    const snapshot = page.history[nextIndex]
    const fileId = snapshotFileId(snapshot.elements)
    const files: BinaryFileData[] = snapshot.image && fileId
      ? [{ id: fileId, dataURL: await getDataURL(snapshot.image), mimeType: 'image/png', created: Date.now() }]
      : []
    // لو الطالب غيّر الصفحة أو رسم حاجة جديدة أثناء التجهيز، منطبقش اللقطة القديمة.
    if (
      pageIndex !== currentPageRef.current ||
      isSwitchingRef.current ||
      page.historyIndex + direction !== nextIndex
    ) return

    page.historyIndex = nextIndex
    api.updateScene({ elements: snapshot.elements })
    replaceFiles(api, files)
    page.elements = snapshot.elements
    page.files = files
    api.history.clear()
    api.setActiveTool({ type: 'freedraw', locked: true })
    flattenedSignatureRef.current = sceneSignature(snapshot.elements)
    updateHistoryState(page)
  }, [flushFlatten, updateHistoryState])

  // نسلسل الضغطات: لو الطالب داس تراجع كذا مرة ورا بعض، كل واحدة تتنفذ بدورها.
  const queueHistoryStep = useCallback((direction: -1 | 1) => {
    historyQueueRef.current = historyQueueRef.current
      .then(() => stepHistory(direction))
      .catch((error: unknown) => {
        console.error('Unable to change dictation history.', error)
      })
    return historyQueueRef.current
  }, [stepHistory])

  const undo = useCallback(() => queueHistoryStep(-1), [queueHistoryStep])
  const redo = useCallback(() => queueHistoryStep(1), [queueHistoryStep])

  const switchPage = useCallback(async (nextIndex: number) => {
    const api = apiRef.current
    const page = pagesRef.current[nextIndex]
    if (!api || !page || isSwitchingRef.current || nextIndex === currentPageRef.current) return
    if (!(await flushFlatten())) return

    const current = pagesRef.current[currentPageRef.current]
    current.elements = api.getSceneElementsIncludingDeleted()
    const currentFileIds = new Set(current.elements.flatMap((element) =>
      element.type === 'image' && !element.isDeleted && element.fileId ? [element.fileId] : [],
    ))
    current.files = Object.values(api.getFiles()).filter((file) => currentFileIds.has(file.id))
    current.background = api.getAppState().viewBackgroundColor

    isSwitchingRef.current = true
    setIsSwitching(true)
    try {
      if (page.files.length) api.addFiles(page.files)
      api.updateScene({
        elements: page.elements,
        appState: {
          currentItemRoughness: 0,
          viewBackgroundColor: page.background,
          activeTool: { type: 'freedraw', customType: null, locked: true, lastActiveTool: null },
        },
      })
      api.history.clear()
      flattenedSignatureRef.current = sceneSignature(page.elements)
      brushColorRef.current = api.getAppState().currentItemStrokeColor
      setBrushColor(brushColorRef.current)
      brushSizeRef.current = api.getAppState().currentItemStrokeWidth
      setBrushSize(brushSizeRef.current)
      backgroundColorRef.current = page.background
      setBackgroundColor(page.background)
      updateHistoryState(page)
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
  }, [flushFlatten, updateHistoryState])

  const addPage = useCallback(() => {
    if (isSwitchingRef.current) return
    const id = nextPageIdRef.current++
    pagesRef.current.push({
      id,
      elements: EMPTY_ELEMENTS,
      files: [],
      background: '#ffffff',
      history: [EMPTY_SNAPSHOT],
      historyIndex: 0,
    })
    setPages((current) => [...current, { id, hasContent: false }])
    void switchPage(pagesRef.current.length - 1)
  }, [switchPage])

  const deletePage = useCallback(async () => {
    if (pagesRef.current.length < 2 || isSwitchingRef.current) return
    if (!confirm(`تحذف الصفحة ${currentPageRef.current + 1} بكل اللي فيها؟`)) return
    if (!(await flushFlatten())) return
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
      appState: {
        currentItemRoughness: 0,
        viewBackgroundColor: page.background,
        activeTool: { type: 'freedraw', customType: null, locked: true, lastActiveTool: null },
      },
    })
    api.history.clear()
    flattenedSignatureRef.current = sceneSignature(page.elements)
    brushColorRef.current = api.getAppState().currentItemStrokeColor
    setBrushColor(brushColorRef.current)
    brushSizeRef.current = api.getAppState().currentItemStrokeWidth
    setBrushSize(brushSizeRef.current)
    backgroundColorRef.current = page.background
    setBackgroundColor(page.background)
    updateHistoryState(page)
    requestAnimationFrame(() => {
      isSwitchingRef.current = false
      setIsSwitching(false)
    })
  }, [flushFlatten, updateHistoryState])

  useImperativeHandle(ref, () => ({
    async getAnswer() {
      const api = apiRef.current
      if (!api) return { pages: [] }
      if (!(await flushFlatten())) throw new Error('تعذر تجهيز صفحات الإجابة.')
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
      const api = apiRef.current
      const page = pagesRef.current[currentPageRef.current]
      if (!api || !page) return
      const history = page.history.slice(0, page.historyIndex + 1)
      history.push(EMPTY_SNAPSHOT)
      page.history = history.slice(-MAX_HISTORY_SNAPSHOTS)
      page.historyIndex = page.history.length - 1
      page.elements = EMPTY_ELEMENTS
      page.files = []
      api.updateScene({ elements: [] })
      api.history.clear()
      flattenedSignatureRef.current = ''
      updateHistoryState(page)
    },
  }), [flushFlatten, saveCurrentPage, updateHistoryState])

  const clearPage = useCallback(async () => {
    if (!confirm('تمسح كل اللي كتبته ورسمته في الصفحة دي؟')) return
    if (!(await flushFlatten())) return
    const page = pagesRef.current[currentPageRef.current]
    const api = apiRef.current
    if (!page || !api) return
    const history = page.history.slice(0, page.historyIndex + 1)
    history.push(EMPTY_SNAPSHOT)
    page.history = history.slice(-MAX_HISTORY_SNAPSHOTS)
    page.historyIndex = page.history.length - 1
    page.elements = EMPTY_ELEMENTS
    page.files = []
    api.updateScene({ elements: [] })
    api.history.clear()
    flattenedSignatureRef.current = ''
    updateHistoryState(page)
  }, [flushFlatten, updateHistoryState])

  const handlePointerUp: NonNullable<ExcalidrawProps['onPointerUp']> = useCallback(() => {
    scheduleFlatten()
  }, [scheduleFlatten])

  const setPenColor = useCallback((color: string) => {
    brushColorRef.current = color
    setBrushColor(color)
    apiRef.current?.updateScene({ appState: { currentItemStrokeColor: color } })
  }, [])

  const setPenSize = useCallback((size: number) => {
    brushSizeRef.current = size
    setBrushSize(size)
    apiRef.current?.updateScene({ appState: { currentItemStrokeWidth: size } })
  }, [])

  const setPageBackground = useCallback((color: string) => {
    backgroundColorRef.current = color
    setBackgroundColor(color)
    pagesRef.current[currentPageRef.current].background = color
    apiRef.current?.updateScene({ appState: { viewBackgroundColor: color } })
  }, [])

  const handleBoardKeyDownCapture = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return
    if (!(event.ctrlKey || event.metaKey)) return
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.stopPropagation()
      if (event.shiftKey) redo()
      else undo()
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      event.stopPropagation()
      redo()
    }
  }, [redo, undo])

  return (
    <div onKeyDownCapture={handleBoardKeyDownCapture} className="dictation-board flex h-full min-h-[480px] flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_24px_80px_-38px_rgba(21,92,92,0.42)] ring-1 ring-black/[0.035]">
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

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!historyState.canUndo || isSwitching}
            aria-label="تراجع"
            title="تراجع"
            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-teal-50 hover:text-teal-800 disabled:pointer-events-none disabled:opacity-30"
          >
            <Undo2 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!historyState.canRedo || isSwitching}
            aria-label="إعادة"
            title="إعادة"
            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-teal-50 hover:text-teal-800 disabled:pointer-events-none disabled:opacity-30"
          >
            <Redo2 className="size-4" aria-hidden />
          </button>
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

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-slate-200/70 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="relative size-9 overflow-hidden rounded-full bg-[conic-gradient(from_0deg,#ef4444,#eab308,#22c55e,#06b6d4,#3b82f6,#a855f7,#ef4444)] p-[3px] shadow-sm ring-1 ring-black/10">
              <span className="block size-full rounded-full border-2 border-white" style={{ backgroundColor: brushColor }} />
              <input
                type="color"
                value={brushColor}
                onChange={(event) => setPenColor(event.target.value)}
                aria-label="لون القلم"
                title="اختار لون القلم"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </span>
            لون القلم
          </label>

          <div className="flex min-w-40 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
            <label htmlFor="dictation-pen-size" className="shrink-0 text-xs font-semibold text-slate-600">سمك القلم</label>
            <input
              id="dictation-pen-size"
              type="range"
              min={1}
              max={100}
              step={1}
              value={brushSize}
              onChange={(event) => setPenSize(Number(event.target.value))}
              aria-label="سمك القلم من 1 إلى 100"
              className="h-1.5 w-24 cursor-pointer accent-teal-700"
            />
            <output htmlFor="dictation-pen-size" className="min-w-7 text-center text-xs font-bold tabular-nums text-teal-800">{brushSize}</output>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <span className="relative size-7 overflow-hidden rounded-lg border border-slate-200 shadow-sm" style={{ backgroundColor }}>
            <input
              type="color"
              value={backgroundColor}
              onChange={(event) => setPageBackground(event.target.value)}
              aria-label="لون خلفية الصفحة"
              title="اختار لون خلفية الصفحة"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </span>
          لون الخلفية
        </label>
      </div>

      <div className="relative min-h-0 flex-1 bg-[#f5f7f7] p-1.5 sm:p-3">
        <div className="pointer-events-none absolute inset-3 rounded-2xl bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.09),_transparent_55%)]" />
        <div className="relative h-full overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm">
          <Excalidraw
            excalidrawAPI={(api) => { apiRef.current = api }}
            onChange={handleChange}
            onPointerUp={handlePointerUp}
            initialData={{ appState: { currentItemRoughness: 0, currentItemStrokeColor: brushColor, currentItemStrokeWidth: brushSize, activeTool: { type: 'freedraw', customType: null, locked: true, lastActiveTool: null } } }}
            langCode="ar-SA"
            theme="light"
            name="التسميع بالكتابة"
            zenModeEnabled
            UIOptions={UI_OPTIONS}
            renderTopRightUI={(isMobile) => (
              <button
                type="button"
                onClick={clearPage}
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
