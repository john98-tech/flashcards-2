'use client'


import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export function BackOneStep({ className }: { className?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        router.push('/#flashcards')
      }}
      aria-label="رجوع خطوة واحدة"
      className={className ?? 'inline-flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}
    >
      <ArrowLeft className="size-4" aria-hidden />
      رجوع
    </button>
  )
}
