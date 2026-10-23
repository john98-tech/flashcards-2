'use client'

import { useActionState, useEffect, useState } from 'react'
import { Eye, EyeOff, Lock, LogIn, Mail, UserPlus } from 'lucide-react'
import { Logo } from '@/components/logo'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import { signIn, signUp, type AuthState } from '@/app/auth/actions'

type Tab = 'signin' | 'signup'

export function AuthForm({ next }: { next: string }) {
  const [tab, setTab] = useState<Tab>('signin')
  const [showPassword, setShowPassword] = useState(false)
  const [signInState, signInAction, signInPending] = useActionState<AuthState, FormData>(signIn, null)
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthState, FormData>(signUp, null)

  const state = tab === 'signin' ? signInState : signUpState
  const pending = signInPending || signUpPending

  useEffect(() => {
    if (state?.error) sfx.wrong()
  }, [state])

  return (
    <div className="rise-in relative w-full max-w-md justify-self-center" style={{ animationDelay: '120ms' }}>
      <div className="glow-border rounded-3xl p-px">
        <div className="rounded-3xl bg-card/90 p-5 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center md:hidden">
            <Logo size={56} className="logo-glow" />
            <span className="text-gradient text-2xl font-bold">Kart w Ketab</span>
          </div>

          <div className="relative mb-6 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist">
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-1 w-[calc(50%-4px)] rounded-lg bg-card shadow transition-all duration-300',
                tab === 'signin' ? 'left-1' : 'left-[calc(50%+3px)]',
              )}
            />
            {(['signin', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'relative z-10 rounded-lg py-2 text-sm font-semibold transition-colors',
                  tab === t ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <h2 className="text-xl font-bold sm:text-2xl">{tab === 'signin' ? 'Welcome back' : 'Start memorizing'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === 'signin' ? 'Sign in to continue your study sessions.' : 'Create a free account in seconds.'}
          </p>

          <form
            key={tab}
            action={tab === 'signin' ? signInAction : signUpAction}
            className="mt-6 flex flex-col gap-4"
          >
            <input type="hidden" name="next" value={next} />
            <Field icon={Mail} label="Email" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="auth-input"
              />
            </Field>
            <Field icon={Lock} label="Password" htmlFor="password">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={tab === 'signup' ? 8 : undefined}
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                placeholder={tab === 'signup' ? 'At least 8 characters' : '••••••••'}
                className="auth-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
              </button>
            </Field>

            <p role="alert" className="min-h-5 text-sm text-destructive">
              {state?.error}
            </p>

            <button
              type="submit"
              disabled={pending}
              className="shine relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-primary via-[oklch(0.55_0.12_170)] to-primary bg-[length:200%_100%] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-right hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-70"
            >
              {tab === 'signin' ? <LogIn className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
              {pending ? 'Please wait…' : tab === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Field({
  icon: Icon,
  label,
  htmlFor,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] shrink-0 -translate-y-1/2 text-primary" />
        {children}
      </div>
    </div>
  )
}
