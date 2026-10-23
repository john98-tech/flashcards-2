import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { Callout, LegalDocument, LegalSection, PageShell, type TocItem } from '@/components/legal-page'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms & Conditions | Kart w Ketab',
  description: 'The rules and conditions that apply when you visit or use Kart w Ketab.',
}

const TOC: TocItem[] = [
  { id: 'acceptance', title: 'Acceptance of terms' },
  { id: 'service', title: 'The Service' },
  { id: 'accounts', title: 'Accounts' },
  { id: 'codes', title: 'Access codes and paid content' },
  { id: 'conduct', title: 'Acceptable use' },
  { id: 'ip', title: 'Intellectual property' },
  { id: 'medical', title: 'Educational use only' },
  { id: 'third-party', title: 'Advertising and third-party links' },
  { id: 'disclaimer', title: 'Disclaimer of warranties' },
  { id: 'liability', title: 'Limitation of liability' },
  { id: 'termination', title: 'Suspension and termination' },
  { id: 'law', title: 'Governing law' },
  { id: 'changes', title: 'Changes to these terms' },
  { id: 'contact', title: 'Contact us' },
]

export default function TermsPage() {
  let n = 0
  const next = () => ++n

  return (
    <PageShell
      icon={FileText}
      eyebrow="Legal"
      title="Terms & Conditions"
      intro="These terms set out the rules for using Kart w Ketab. Please read them carefully, because by visiting or using the site you agree to be bound by them."
      meta={`Last updated: ${SITE.legalUpdated}`}
    >
      <LegalDocument toc={TOC}>
        <LegalSection id="acceptance" index={next()} title="Acceptance of terms">
          <p>
            By accessing or using {SITE.name} (the &quot;Service&quot;) you confirm that you have read, understood and
            agree to these Terms & Conditions and to our <Link href="/privacy">Privacy Policy</Link>. If you do not
            agree, you must not use the Service.
          </p>
        </LegalSection>

        <LegalSection id="service" index={next()} title="The Service">
          <p>
            {SITE.name} offers fill-in-the-blank flashcards for studying medical textbooks. Some decks are free and some
            require an access code. We may add, change, suspend or remove features and content at any time, with or
            without notice.
          </p>
        </LegalSection>

        <LegalSection id="accounts" index={next()} title="Accounts">
          <ul>
            <li>You must provide accurate information when you register and keep it up to date.</li>
            <li>You are responsible for keeping your password confidential and for all activity under your account.</li>
            <li>
              Accounts are personal. You may not share your account or let others use it to access content they have not
              been given access to.
            </li>
            <li>Tell us promptly if you suspect unauthorized use of your account.</li>
          </ul>
        </LegalSection>

        <LegalSection id="codes" index={next()} title="Access codes and paid content">
          <p>
            Paid decks are unlocked with an access code. Each code can be redeemed once, is tied to the account that
            redeems it, and may not be resold, transferred or published. Codes that are shared, leaked or obtained
            improperly may be revoked without refund.
          </p>
          <p>
            Trial codes give limited access for the period shown when you receive them. Unless the law requires
            otherwise, purchases and redeemed codes are non-refundable.
          </p>
        </LegalSection>

        <LegalSection id="conduct" index={next()} title="Acceptable use">
          <p>When using the Service you agree not to:</p>
          <ul>
            <li>Break any law or infringe the rights of others.</li>
            <li>Copy, scrape, download in bulk, redistribute or resell the content or the Service.</li>
            <li>Attempt to gain unauthorized access to the Service, other accounts, or our systems.</li>
            <li>Interfere with or disrupt the Service, including by introducing malware or overloading our servers.</li>
            <li>Use bots or automated means to access the Service, or to click on or manipulate advertising.</li>
            <li>Send spam, abusive or misleading messages through the contact form.</li>
          </ul>
        </LegalSection>

        <LegalSection id="ip" index={next()} title="Intellectual property">
          <p>
            The Service, including its design, software, logo, text and graphics, is owned by us or our licensors and is
            protected by intellectual property laws. We grant you a limited, personal, non-exclusive, non-transferable
            licence to use the Service for your own study.
          </p>
          <p>
            Card content is created as a study aid. Underlying textbooks and the works they quote remain the property of
            their respective authors and publishers. If you believe content on the Service infringes your rights, please
            tell us through the <Link href="/contact">contact page</Link> and we will review it promptly.
          </p>
        </LegalSection>

        <LegalSection id="medical" index={next()} title="Educational use only">
          <Callout>
            The Service is a learning tool. It does not provide medical advice, diagnosis or treatment.
          </Callout>
          <p>
            Content is intended to support exam preparation and revision. Always consult the original textbook, your
            instructors and current clinical guidelines. Never rely on the Service to make decisions about the care of a
            patient.
          </p>
        </LegalSection>

        <LegalSection id="third-party" index={next()} title="Advertising and third-party links">
          <p>
            The Service may display advertisements, including ads served by Google, and may link to third-party websites.
            We do not control and are not responsible for those sites or advertisers, and their inclusion does not mean we
            endorse them. Your dealings with third parties are solely between you and them. See our{' '}
            <Link href="/privacy">Privacy Policy</Link> for how advertising cookies work and how to opt out.
          </p>
        </LegalSection>

        <LegalSection id="disclaimer" index={next()} title="Disclaimer of warranties">
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express
            or implied. We do not guarantee that the Service will be uninterrupted, secure or error-free, or that the
            content is complete, accurate or suitable for any particular exam or purpose.
          </p>
        </LegalSection>

        <LegalSection id="liability" index={next()} title="Limitation of liability">
          <p>
            To the fullest extent permitted by law, we will not be liable for any indirect, incidental, special,
            consequential or punitive damages, or any loss of data, profits or exam results, arising out of your use of
            or inability to use the Service. Our total liability for any claim is limited to the amount you paid us, if
            any, in the twelve months before the claim arose.
          </p>
        </LegalSection>

        <LegalSection id="termination" index={next()} title="Suspension and termination">
          <p>
            We may suspend or terminate your access at any time, with or without notice, if you breach these terms or if
            we need to protect the Service or other users. You may stop using the Service and ask us to delete your
            account at any time. Sections that by their nature should survive termination will do so.
          </p>
        </LegalSection>

        <LegalSection id="law" index={next()} title="Governing law">
          <p>
            These terms are governed by the laws of the jurisdiction in which the Service operator is established,
            without regard to conflict-of-law rules. Mandatory consumer protection rights in your country of residence
            are not affected.
          </p>
        </LegalSection>

        <LegalSection id="changes" index={next()} title="Changes to these terms">
          <p>
            We may revise these terms from time to time. The current version will always be available on this page with
            its &quot;Last updated&quot; date. Continued use of the Service after changes take effect means you accept the
            revised terms.
          </p>
        </LegalSection>

        <LegalSection id="contact" index={next()} title="Contact us">
          <p>
            Questions about these terms? Reach out through our <Link href="/contact">contact page</Link>
            {SITE.contactEmail ? (
              <>
                {' '}
                or email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
              </>
            ) : null}
            .
          </p>
        </LegalSection>
      </LegalDocument>
    </PageShell>
  )
}
