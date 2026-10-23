'use client'

import { useActionState } from 'react'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { adminLogin, type LoginState } from '@/app/admin/actions'

export function AdminLogin() {
  const [state, action, pending] = useActionState<LoginState, FormData>(adminLogin, null)

  return (
    <form action={action} className="mx-auto flex max-w-sm flex-col gap-3 rounded-xl border bg-card p-6">
      <h1 className="text-lg font-semibold">Admin sign in</h1>
      <label htmlFor="admin-password" className="text-xs font-medium text-muted-foreground">
        Password
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {state?.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        <LogIn aria-hidden /> {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
