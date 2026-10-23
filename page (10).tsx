import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Callout, LegalDocument, LegalSection, PageShell, type TocItem } from '@/components/legal-page'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy | Kart w Ketab',
  description:
    'How Kart w Ketab collects, uses and protects your information, including cookies and Google advertising.',
}

const TOC: TocItem[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'information', title: 'Information we collect' },
  { id: 'use', title: 'How we use information' },
  { id: 'cookies', title: 'Cookies and similar technologies' },
  { id: 'advertising', title: 'Google advertising' },
  { id: 'sharing', title: 'Who we share data with' },
  { id: 'retention', title: 'Data retention and security' },
  { id: 'rights', title: 'Your rights and choices' },
  { id: 'children', title: "Children's privacy" },
  { id: 'changes', title: 'Changes to this policy' },
  { id: 'contact', title: 'Contact us' },
]

export default function PrivacyPage() {
  let n = 0
  const next = () => ++n

  return (
    <PageShell
      icon={ShieldCheck}
      eyebrow="Legal"
      title="Privacy Policy"
      intro="Your privacy matters to us. This policy explains what we collect when you use Kart w Ketab, why we collect it, how cookies and Google advertising work on our site, and the choices you have."
      meta={`Last updated: ${SITE.legalUpdated}`}
    >
      <LegalDocument toc={TOC}>
        <LegalSection id="overview" index={next()} title="Overview">
          <p>
            {SITE.name} (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) provides fill-in-the-blank flashcards that help
            students memorize medical textbooks. This Privacy Policy applies to our website and to any pages, features
            and services we offer through it (the &quot;Service&quot;).
          </p>
          <p>
            By using the Service you agree to the practices described here. If you do not agree, please do not use the
            Service.
          </p>
        </LegalSection>

        <LegalSection id="information" index={next()} title="Information we collect">
          <p>We collect only what we need to run the Service:</p>
          <ul>
            <li>
              <strong>Account information.</strong> Your email address and a securely hashed password when you create an
              account. We never see or store your password in plain text.
            </li>
            <li>
              <strong>Study activity.</strong> Which decks you open and the cards you mark as known, so we can save your
              progress and show you what is left to review.
            </li>
            <li>
              <strong>Access codes.</strong> When you redeem a code we record which account used it and when, so that each
              code can only be used once.
            </li>
            <li>
              <strong>Messages you send us.</strong> If you use the contact form, we store your name, email address and the
              message so we can reply.
            </li>
            <li>
              <strong>Technical data.</strong> Standard information your browser sends automatically, such as IP address,
              browser type, device type, pages visited and approximate region, collected through server logs and
              privacy-friendly analytics.
            </li>
            <li>
              <strong>Preferences stored on your device.</strong> Settings such as sound options and tutorial progress may be
              saved in your browser&apos;s local storage so they persist between visits.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="use" index={next()} title="How we use information">
          <ul>
            <li>To create and secure your account and keep you signed in.</li>
            <li>To save your study progress and unlock content you are entitled to.</li>
            <li>To respond to your questions and support requests.</li>
            <li>To understand how the Service is used so we can fix problems and improve it.</li>
            <li>To prevent abuse, fraud and unauthorized access.</li>
            <li>To show advertising that helps keep the Service available (see below).</li>
            <li>To comply with legal obligations.</li>
          </ul>
          <p>We do not sell your personal information.</p>
        </LegalSection>

        <LegalSection id="cookies" index={next()} title="Cookies and similar technologies">
          <p>
            Cookies are small text files stored on your device. We and our partners use cookies and similar technologies
            such as local storage for the following purposes:
          </p>
          <ul>
            <li>
              <strong>Essential cookies.</strong> Required to sign you in and keep your session secure. Without them the
              Service cannot work, so they cannot be switched off.
            </li>
            <li>
              <strong>Preference storage.</strong> Remembers settings such as sound and the tutorial so you do not have to
              set them again.
            </li>
            <li>
              <strong>Analytics.</strong> We use Vercel Analytics to measure traffic in aggregate. It is designed to work
              without cookies and does not build advertising profiles.
            </li>
            <li>
              <strong>Advertising cookies.</strong> Set by Google and its advertising partners when ads are shown, as
              described in the next section.
            </li>
          </ul>
          <p>
            You can control or delete cookies at any time in your browser settings. Blocking essential cookies will
            prevent you from signing in.
          </p>
        </LegalSection>

        <LegalSection id="advertising" index={next()} title="Google advertising">
          <p>
            We may display ads served by Google, including Google AdSense. Google and other third-party vendors use
            cookies to serve ads based on your prior visits to this website and other websites on the internet.
          </p>
          <ul>
            <li>
              Google&apos;s use of advertising cookies, such as the DoubleClick cookie, enables it and its partners to serve
              ads to you based on your visit to our site and/or other sites.
            </li>
            <li>
              Google may use web beacons, device identifiers and similar technologies to measure ad performance and limit
              how often you see the same ad.
            </li>
            <li>
              Where required by law, such as in the European Economic Area and the United Kingdom, personalized ads are
              shown only with your consent.
            </li>
          </ul>
          <p>You can opt out of personalized advertising at any time:</p>
          <ul>
            <li>
              Visit{' '}
              <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
                Google Ads Settings
              </a>{' '}
              to turn off personalized ads.
            </li>
            <li>
              Visit{' '}
              <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
                aboutads.info
              </a>{' '}
              to opt out of third-party vendors&apos; use of cookies for personalized advertising.
            </li>
            <li>
              Learn how Google uses data from sites that use its services at{' '}
              <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
                policies.google.com/technologies/partner-sites
              </a>
              .
            </li>
          </ul>
          <Callout>
            Opting out does not remove ads. You will still see ads, but they will be less relevant to your interests.
          </Callout>
        </LegalSection>

        <LegalSection id="sharing" index={next()} title="Who we share data with">
          <p>We share information only with service providers that help us operate the Service, and only as needed:</p>
          <ul>
            <li>
              <strong>Supabase</strong> for authentication and database hosting.
            </li>
            <li>
              <strong>Vercel</strong> for website hosting and analytics.
            </li>
            <li>
              <strong>Google</strong> for advertising, when ads are enabled.
            </li>
          </ul>
          <p>
            We may also disclose information if required by law, to enforce our Terms, or to protect the rights, safety
            and security of our users and the Service. These providers process data under their own privacy policies and
            may store it in countries other than your own.
          </p>
        </LegalSection>

        <LegalSection id="retention" index={next()} title="Data retention and security">
          <p>
            We keep your account data for as long as your account is active. Contact messages are kept only as long as
            needed to handle your request. You can ask us to delete your account and associated data at any time.
          </p>
          <p>
            We use industry-standard safeguards, including encrypted connections (HTTPS) and access controls. No method of
            transmission or storage is completely secure, so we cannot guarantee absolute security.
          </p>
        </LegalSection>

        <LegalSection id="rights" index={next()} title="Your rights and choices">
          <p>Depending on where you live, you may have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you.</li>
            <li>Correct information that is inaccurate or incomplete.</li>
            <li>Delete your account and personal information.</li>
            <li>Object to or restrict certain processing, and withdraw consent where we rely on it.</li>
            <li>Receive a copy of your data in a portable format.</li>
            <li>Opt out of the sale or sharing of personal information. We do not sell personal information.</li>
          </ul>
          <p>
            To exercise any of these rights, reach us through the{' '}
            <Link href="/contact">contact page</Link>. We may need to verify your identity before acting on a request.
          </p>
        </LegalSection>

        <LegalSection id="children" index={next()} title="Children's privacy">
          <p>
            The Service is intended for students and is not directed to children under 13. We do not knowingly collect
            personal information from children under 13. If you believe a child has given us personal information, please
            contact us and we will delete it promptly.
          </p>
        </LegalSection>

        <LegalSection id="changes" index={next()} title="Changes to this policy">
          <p>
            We may update this policy from time to time. When we do, we will change the &quot;Last updated&quot; date at
            the top of this page. If a change is significant we will make a reasonable effort to notify you. Continuing to
            use the Service after a change means you accept the updated policy.
          </p>
        </LegalSection>

        <LegalSection id="contact" index={next()} title="Contact us">
          <p>
            Questions about this Privacy Policy or your data? Send us a message on our{' '}
            <Link href="/contact">contact page</Link>
            {SITE.contactEmail ? (
              <>
                {' '}
                or email us at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
              </>
            ) : null}
            .
          </p>
        </LegalSection>
      </LegalDocument>
    </PageShell>
  )
}
