'use client'

import { useActionState, useState } from 'react'
import { CircleAlert, CircleCheck, Send } from 'lucide-react'
import { sendContactMessage, type ContactState } from '@/app/contact/actions'
import { cn } from '@/lib/utils'

const SUBJECTS = ['General question', 'Technical problem', 'Access code or billing', 'Content feedback', 'Privacy or legal', 'Other']

const inputClass =
  'w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary focus:ring-4 focus:ring-primary/15 aria-[invalid=true]:border-destructive'

export function ContactForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactMessage, null)
  const [length, setLength] = useState(0)

  if (state?.ok) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CircleCheck className="size-7" aria-hidden />
        </span>
        <h2 className="text-xl font-bold">Message sent</h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{state.message}</p>
      </div>
    )
  }

  const err = state?.errors

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={err?.name}>
          <input id="name" name="name" type="text" required maxLength={100} autoComplete="name" placeholder="Your full name" className={inputClass} aria-invalid={!!err?.name} />
        </Field>
        <Field label="Email address" htmlFor="email" error={err?.email}>
          <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" defaultValue={defaultEmail} placeholder="you@example.com" className={inputClass} aria-invalid={!!err?.email} />
        </Field>
      </div>

      <Field label="Subject" htmlFor="subject" error={err?.subject}>
        <select id="subject" name="subject" required defaultValue="" className={inputClass} aria-invalid={!!err?.subject}>
          <option value="" disabled>
            Choose a subject
          </option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Message" htmlFor="message" error={err?.message}>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={3000}
          placeholder="How can we help?"
          onChange={(e) => setLength(e.target.value.length)}
          className={cn(inputClass, 'resize-y')}
          aria-invalid={!!err?.message}
        />
        <span className="mt-1 block text-end text-xs tabular-nums text-muted-foreground">{length} / 3000</span>
      </Field>

      {/* Honeypot field for bots. Hidden from people and assistive technology. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state && !state.ok && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="shine relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-primary via-[oklch(0.55_0.12_170)] to-primary bg-[length:200%_100%] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-right hover:shadow-xl active:scale-[0.98] disabled:opacity-70"
      >
        <Send className="size-4" aria-hidden />
        {pending ? 'Sending…' : 'Send message'}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        We only use your details to reply to this message.
      </p>
    </form>
  )
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div>{children}</div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
