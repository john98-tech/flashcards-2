'use client'

import { ChevronLeft, ChevronRight, FilePlus2, FileX2 } from 'lucide-react'

type Props = {
  currentPage: number
  pageCount: number
  maxPages: number
  isBusy: boolean
  onPrevious: () => void
  onNext: () => void
  onAdd: () => void
  onDelete: () => void
}

const buttonClass = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40'

export function PageBar({
  currentPage,
  pageCount,
  maxPages,
  isBusy,
  onPrevious,
  onNext,
  onAdd,
  onDelete,
}: Props) {
  const onlyPage = pageCount === 1

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/80 p-2" aria-label="صفحات الإجابة">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrevious} disabled={currentPage === 0 || isBusy} aria-label="الصفحة السابقة" className={buttonClass}>
          <ChevronRight className="size-4" aria-hidden />
          <span className="hidden sm:inline">السابقة</span>
        </button>
        <p className="min-w-20 text-center text-sm font-bold tabular-nums text-slate-700" aria-live="polite">
          {currentPage + 1} / {pageCount}
        </p>
        <button type="button" onClick={onNext} disabled={currentPage >= pageCount - 1 || isBusy} aria-label="الصفحة التالية" className={buttonClass}>
          <span className="hidden sm:inline">التالية</span>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onAdd} disabled={pageCount >= maxPages || isBusy} className={`${buttonClass} border-teal-700 bg-teal-700 text-white hover:bg-teal-800`}>
          <FilePlus2 className="size-4" aria-hidden />
          إضافة صفحة
        </button>
        <button type="button" onClick={onDelete} disabled={isBusy} className={`${buttonClass} border-rose-200 text-rose-700 hover:bg-rose-50`}>
          <FileX2 className="size-4" aria-hidden />
          {onlyPage ? 'مسح الصفحة' : 'حذف الصفحة'}
        </button>
      </div>
    </nav>
  )
}
