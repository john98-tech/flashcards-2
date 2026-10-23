import Link from 'next/link'
import { Logo } from '@/components/logo'
import { getSession } from '@/lib/auth'
import { FOOTER_LINKS, SITE } from '@/lib/site'

export async function SiteFooter() {
  const session = await getSession()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t bg-card/60 backdrop-blur-sm">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-xs">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Logo size={28} className="size-7" />
            <span className="text-gradient">{SITE.name}</span>
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Fill-in-the-blank flashcards that help medical students memorize their textbooks word for word.
          </p>
        </div>

        <nav aria-label="Company">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/70">Company</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {FOOTER_LINKS.slice(0, 2).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted-foreground transition-colors hover:text-primary">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/70">Legal</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {FOOTER_LINKS.slice(2).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted-foreground transition-colors hover:text-primary">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {year} {SITE.name}. All rights reserved.
          </p>
          {session?.isAdmin && (
            <Link href="/admin" data-tour="admin-link" data-tour-action="open-admin" className="hover:text-foreground">
              Admin panel
            </Link>
          )}
        </div>
      </div>
    </footer>
  )
}
