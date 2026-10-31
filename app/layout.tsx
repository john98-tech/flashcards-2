import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Arabic } from 'next/font/google'
import { AmbientBackground } from '@/components/fx/ambient-background'
import { CursorFx } from '@/components/fx/cursor-fx'
import { SoundEngine } from '@/components/fx/sound-engine'
import { OnboardingTour } from '@/components/onboarding-tour'
import { WhatsAppButton } from '@/components/whatsapp-button'
import { FacebookButton } from '@/components/facebook-button'
import { FeedbackWidget } from '@/components/feedback-widget'
import { MobileContactMenu } from '@/components/mobile-contact-menu'
import { getSession } from '@/lib/auth'
import './globals.css'

const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
})

const SITE_URL = 'https://kartwketab.com'

export const metadata: Metadata = {
  title: {
    default: 'Kart w Ketab | فلاش كاردز طبية',
    template: '%s | Kart w Ketab',
  },
  description:
    'ذاكر المواد الطبية بذكاء مع الفلاش كاردز، والتسميع بالكتابة، والمراجعة اليومية، وتقارير تساعدك تثبّت المعلومات.',
  applicationName: 'Kart w Ketab',
  generator: 'Next.js',
  keywords: ['فلاش كاردز', 'طب', 'مذاكرة', 'flashcards', 'medical', 'study', 'kart w ketab', 'كارت وكتاب'],
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: 'Kart w Ketab | فلاش كاردز طبية',
    description:
      'ذاكر المواد الطبية بذكاء مع الفلاش كاردز، والتسميع بالكتابة، والمراجعة اليومية، وتقارير تساعدك تثبّت المعلومات.',
    url: SITE_URL,
    siteName: 'Kart w Ketab',
    type: 'website',
    locale: 'ar_EG',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Kart w Ketab logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'Kart w Ketab | فلاش كاردز طبية',
    description:
      'ذاكر المواد الطبية بذكاء مع الفلاش كاردز، والتسميع بالكتابة، والمراجعة اليومية.',
    images: ['/logo.png'],
  },
  icons: {
    icon: [{ url: '/favicon.svg?v=2', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg?v=2',
    apple: '/logo.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8f5ef',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession()

  return (
    <html lang="ar" dir="rtl" className={plex.variable}>
      <body className="font-sans antialiased">
        <AmbientBackground />
        {children}
        {session && (
          <OnboardingTour
            userId={session.id}
            completed={session.onboardingCompleted}
            isAdmin={session.isAdmin}
          />
        )}
        <WhatsAppButton />
        <FacebookButton />
        <FeedbackWidget />
        <MobileContactMenu />
        <CursorFx />
        <SoundEngine />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
