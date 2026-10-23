'use client'

import { useActionState } from 'react'
import { KeyRound, MessageCircle } from 'lucide-react'
import { whatsappLink } from '@/lib/site'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { redeemCode, type RedeemState } from '@/app/actions'

export function RedeemForm({ className }: { className?: string }) {
  const [state, action, pending] = useActionState<RedeemState, FormData>(redeemCode, null)

  return (
    <form action={action} data-tour="access-code" className={cn('flex flex-col gap-2', className)}>
      <label htmlFor="access-code" className="text-sm font-semibold">
        Have an access code?
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="access-code"
          name="code"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-sm uppercase tracking-wider outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" disabled={pending}>
          <KeyRound aria-hidden /> {pending ? 'Checking…' : 'Unlock'}
        </Button>
      </div>
      <p
        role="status"
        className={cn('min-h-4 text-xs', state?.ok ? 'text-success' : 'text-destructive')}
      >
        {state?.message}
      </p>
      <a
        href={whatsappLink('Hello, I would like to get an access code for Kart w Ketab')}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[#128C7E] underline underline-offset-4"
      >
        <MessageCircle className="size-3.5" aria-hidden /> Get an access code on WhatsApp
      </a>
    </form>
  )
}
