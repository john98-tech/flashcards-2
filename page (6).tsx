import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Mail, MessageCircle, MessageSquare, Phone, ShieldCheck } from 'lucide-react'
import { PageShell } from '@/components/legal-page'
import { ContactForm } from '@/components/contact-form'
import { getSession } from '@/lib/auth'
import { SITE, whatsappLink } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact us | Kart w Ketab',
  description: 'Get in touch with the Kart w Ketab team for support, feedback or privacy questions.',
}

export default async function ContactPage() {
  const session = await getSession()

  return (
    <PageShell
      icon={Mail}
      eyebrow="Contact us"
      title="We would love to hear from you"
      intro="Found a problem, need help with an access code, or have an idea for a new deck? Send us a message and we will reply by email."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-label="Contact form" className="rounded-3xl border bg-card/80 p-6 shadow-sm sm:p-8">
          <ContactForm defaultEmail={session?.email ?? ''} />
        </section>

        <aside className="flex flex-col gap-4">
          {SITE.contactPhone && (
            <InfoCard icon={Phone} title="Phone / WhatsApp">
              <a
                href={`tel:${SITE.contactPhone}`}
                className="font-medium text-primary underline underline-offset-4"
                dir="ltr"
              >
                {SITE.contactPhone}
              </a>
              <a
                href={whatsappLink('Hello, I have a question about Kart w Ketab')}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex w-fit items-center gap-2 rounded-full bg-[#25D366] px-3.5 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <MessageCircle className="size-4" aria-hidden /> Chat on WhatsApp
              </a>
            </InfoCard>
          )}
          {SITE.contactEmail && (
            <InfoCard icon={Mail} title="Email">
              <a href={`mailto:${SITE.contactEmail}`} className="break-all font-medium text-primary underline underline-offset-4">
                {SITE.contactEmail}
              </a>
            </InfoCard>
          )}
          <InfoCard icon={Clock} title="Response time">
            We usually reply within 1 to 3 working days.
          </InfoCard>
          <InfoCard icon={MessageSquare} title="Good to include">
            Your account email, the deck name and, for technical issues, the device and browser you use.
          </InfoCard>
          <InfoCard icon={ShieldCheck} title="Your privacy">
            Read how we handle your data in our{' '}
            <Link href="/privacy" className="font-medium text-primary underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </InfoCard>
        </aside>
      </div>
    </PageShell>
  )
}

function InfoCard({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 rounded-2xl border bg-card/80 p-4 shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 text-sm leading-relaxed text-muted-foreground">
        <h2 className="font-semibold text-foreground">{title}</h2>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  )
}
