import Link from 'next/link'
import { LogOut, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/logo'
import { SettingsMenu } from '@/components/settings-menu'
import { getSession } from '@/lib/auth'
import { signOut } from '@/app/auth/actions'

export async function SiteHeader({ children }: { children?: React.ReactNode }) {
  const session = await getSession()

  return (
    <header className="sticky top-0 z-40 border-b bg-card/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="group flex items-center gap-2 min-w-0 text-base font-bold sm:text-lg">
          <Logo size={32} className="size-7 shrink-0 sm:size-8" />
          <span className="text-gradient truncate">Kart w Ketab</span>
        </Link>
        <div className="flex items-center gap-2 md:gap-3">
          {children}
          {session?.isAdmin && (
            <Link
              href="/admin"
              className="hidden items-center gap-1 rounded-full bg-highlight px-3 py-1 text-xs font-semibold text-highlight-foreground sm:flex"
            >
              <ShieldCheck className="size-3.5" aria-hidden /> Admin
            </Link>
          )}
          {session && (
            <span className="hidden max-w-40 truncate text-xs text-muted-foreground md:inline" title={session.email}>
              {session.email}
            </span>
          )}
          <SettingsMenu showTutorialButton={!!session} />
          {session && (
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Sign out"
                className="flex size-9 items-center justify-center rounded-full border bg-card/70 text-muted-foreground transition-colors hover:text-destructive"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  )
}
