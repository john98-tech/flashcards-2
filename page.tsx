import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, EyeOff, Info, Keyboard, LineChart, Target, type LucideIcon } from 'lucide-react'
import { PageShell } from '@/components/legal-page'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'About us | Kart w Ketab',
  description:
    'Kart w Ketab helps medical students memorize their textbooks word for word with fill-in-the-blank flashcards.',
}

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: EyeOff,
    title: 'Fill-in-the-blank cards',
    text: 'Every card holds a sentence exactly as it appears in the book, with the key words hidden so you recall them instead of just recognizing them.',
  },
  {
    icon: Keyboard,
    title: 'Tap or type',
    text: 'Reveal one word at a time or type the answer yourself. Keyboard shortcuts keep long study sessions fast.',
  },
  {
    icon: LineChart,
    title: 'Progress tracking',
    text: 'Mark what you have mastered and what still needs work, so each session focuses on the cards that matter.',
  },
  {
    icon: BookOpen,
    title: 'Built from real textbooks',
    text: 'Decks are organized by subject and book, so your revision follows the material you are actually examined on.',
  },
]

export default function AboutPage() {
  return (
    <PageShell
      icon={Info}
      eyebrow="About us"
      title="Learn the textbook word for word"
      intro={`${SITE.name} is a study tool for medical students who need to know their books precisely, not just roughly. We turn textbook sentences into focused fill-in-the-blank flashcards.`}
    >
      <div className="flex flex-col gap-10">
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border bg-card/80 p-6 shadow-sm sm:p-8">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Target className="size-5 text-primary" aria-hidden />
              Our mission
            </h2>
            <p className="mt-3 leading-relaxed text-foreground/85">
              Medical exams reward exact knowledge. Our goal is to make memorizing dense textbooks faster, more active and
              less stressful, so students can spend their time understanding medicine instead of fighting their notes.
            </p>
          </div>
          <div className="rounded-3xl border bg-card/80 p-6 shadow-sm sm:p-8">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Info className="size-5 text-primary" aria-hidden />
              Who we are
            </h2>
            <p className="mt-3 leading-relaxed text-foreground/85">
              {SITE.name} is an independent project built and maintained by a small team that cares about student
              learning. We keep improving the platform based on feedback from the students who use it.
            </p>
          </div>
        </section>

        <section aria-labelledby="how">
          <h2 id="how" className="text-2xl font-bold">
            What makes it work
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="group rounded-2xl border bg-card/80 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border bg-card/80 p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-bold">Free to start, supported by ads</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-foreground/85">
            Some decks are free for everyone. Premium decks are unlocked with an access code, and we may show advertising,
            including Google ads, to help cover hosting and development. You can read how we handle cookies and your data
            in our <Link href="/privacy" className="font-medium text-primary underline underline-offset-4">Privacy Policy</Link>.
          </p>
        </section>

        <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary to-[oklch(0.5_0.1_175)] p-8 text-primary-foreground shadow-lg shadow-primary/20 sm:p-10">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold">Questions, feedback or ideas?</h2>
              <p className="mt-2 text-primary-foreground/85">
                We read every message. Tell us what would make your studying easier.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-card px-6 font-semibold text-foreground shadow transition-transform hover:scale-[1.03] active:scale-95"
            >
              Contact us
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  )
}
