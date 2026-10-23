import type { Metadata } from 'next'
import { Logo } from '@/components/logo'
import { AuthForm } from '@/components/auth/auth-form'
import { FloatingCards } from '@/components/auth/floating-cards'
import { SettingsMenu } from '@/components/settings-menu'
import { FOOTER_LINKS } from '@/lib/site'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sign in | Kart w Ketab'
,
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams
  const nextPath = typeof next === 'string' ? next : '/'

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 pb-14 pt-6 sm:pb-16 sm:pt-10">
      <FloatingCards />
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4 z-20">
        <SettingsMenu showTutorialButton={false} />
      </div>

      <main className="relative z-10 grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
        <section className="rise-in hidden md:block">
          <div className="flex items-center gap-3">
            <Logo size={56} className="logo-glow" />
            <span className="text-gradient text-4xl font-bold">Kart w Ketab</span>
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-tight text-balance">
            Memorize the textbook <span className="text-gradient">word for word</span>
          </h1>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground text-pretty">
            Fill-in-the-blank flashcards built from your medical books. Reveal one word at a time, test yourself, and
            track what you&apos;ve mastered.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2 text-xs font-medium">
            {['Keyboard shortcuts', 'Progress tracking', 'Tap or type mode'].map((t, i) => (
              <li
                key={t}
                className="rise-in rounded-full border bg-card/70 px-3 py-1.5 backdrop-blur"
                style={{ animationDelay: `${200 + i * 120}ms` }}
              >
                {t}
              </li>
            ))}
          </ul>
        </section>

        <AuthForm next={nextPath} />
      </main>

      <nav
        aria-label="Legal"
        className="absolute inset-x-0 bottom-3 z-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 text-xs text-muted-foreground"
      >
        {FOOTER_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="transition-colors hover:text-primary">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
