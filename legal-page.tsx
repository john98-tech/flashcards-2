import type { ComponentType, ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

export type TocItem = { id: string; title: string }

export function PageShell({
  icon: Icon,
  eyebrow,
  title,
  intro,
  meta,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  eyebrow: string
  title: string
  intro: string
  meta?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-10">
        <header className="rise-in relative mb-10 overflow-hidden rounded-3xl border bg-card/80 p-6 shadow-sm sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/15 blur-3xl"
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.55_0.12_170)] text-primary-foreground shadow-lg shadow-primary/25">
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
              <h1 className="mt-1 text-3xl font-bold text-balance sm:text-4xl">{title}</h1>
              <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">{intro}</p>
              {meta && (
                <p className="mt-4 inline-flex rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {meta}
                </p>
              )}
            </div>
          </div>
        </header>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

export function LegalDocument({ toc, children }: { toc: TocItem[]; children: ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
      <aside className="hidden lg:block">
        <nav aria-label="On this page" className="sticky top-20">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/70">On this page</h2>
          <ol className="mt-3 flex flex-col gap-0.5 border-s text-sm">
            {toc.map((item, i) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="-ms-px block border-s border-transparent py-1.5 ps-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <span className="me-2 tabular-nums text-xs text-muted-foreground/60">{i + 1}.</span>
                  {item.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>
      <article className="rounded-3xl border bg-card/80 p-6 shadow-sm sm:p-10">{children}</article>
    </div>
  )
}

export function LegalSection({
  id,
  index,
  title,
  children,
}: {
  id: string
  index: number
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b py-8 first:pt-0 last:border-b-0 last:pb-0">
      <h2 className="flex items-baseline gap-3 text-xl font-bold">
        <span className="text-sm font-semibold tabular-nums text-primary">{String(index).padStart(2, '0')}</span>
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4 leading-relaxed text-foreground/85 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_li]:ps-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-6 [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  )
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-primary/20 bg-accent/60 px-4 py-3 text-sm leading-relaxed text-accent-foreground">
      {children}
    </p>
  )
}
