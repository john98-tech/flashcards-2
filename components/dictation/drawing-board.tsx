'use client'

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'

const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then((module) => module.Excalidraw),
  {
    ssr: false,
    loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">بيجهز مساحة الكتابة…</div>,
  },
)

export type DictationAnswer = {
  text: string
  image?: string
}

export type DrawingBoardHandle = {
  getAnswer: () => Promise<DictationAnswer>
  clear: () => void
}

const UI_OPTIONS = {
  tools: {
    image: false,
  },
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: true,
    export: false as const,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
}

export const DrawingBoard = forwardRef<DrawingBoardHandle>(function DrawingBoard(_, ref) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const hasContentRef = useRef(false)
  const [hasContent, setHasContent] = useState(false)

  const handleChange = useCallback((elements: readonly { id: string }[]) => {
    const nextHasContent = elements.length > 0
    if (hasContentRef.current !== nextHasContent) {
      hasContentRef.current = nextHasContent
      setHasContent(nextHasContent)
    }
  }, [])

  const renderTopRightUI = useCallback(() => (
    <button
      type="button"
      disabled={!hasContent}
      onClick={() => {
        if (confirm('تمسح كل اللي كتبته ورسمته؟')) apiRef.current?.updateScene({ elements: [] })
      }}
      className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm disabled:opacity-40"
    >
      مسح الكل
    </button>
  ), [hasContent])

  useImperativeHandle(ref, () => ({
    async getAnswer() {
      const api = apiRef.current
      if (!api) return { text: '' }
      const elements = api.getSceneElements()
      const text = elements
        .filter((element) => element.type === 'text')
        .map((element) => element.text.trim())
        .filter(Boolean)
        .join('\n')
      if (!elements.length) return { text }

      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const blob = await exportToBlob({
        elements,
        appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: '#ffffff' },
        files: api.getFiles(),
        mimeType: 'image/jpeg',
        quality: 0.85,
        maxWidthOrHeight: 1600,
      })
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('تعذر قراءة صورة الإجابة.'))
        reader.onerror = () => reject(reader.error ?? new Error('تعذر قراءة صورة الإجابة.'))
        reader.readAsDataURL(blob)
      })
      return { text, image: dataUrl.split(',')[1] }
    },
    clear() {
      apiRef.current?.updateScene({ elements: [] })
    },
  }), [])

  return (
    <div className="h-full w-full" dir="ltr">
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api }}
        onChange={handleChange}
        langCode="ar-SA"
        theme="light"
        name="التسميع بالكتابة"
        UIOptions={UI_OPTIONS}
        renderTopRightUI={renderTopRightUI}
      />
    </div>
  )
})
