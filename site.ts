export const SITE = {
  name: 'Kart w Ketab',
  tagline: 'Medical flashcards, word for word',
  /** Optional. Set NEXT_PUBLIC_CONTACT_EMAIL in the environment to show an official email address on the site. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || '',
  /** Phone / WhatsApp number in international format. */
  contactPhone: '+201062590087',
  legalUpdated: 'October 22, 2026',
}

/** WhatsApp chat link built from the contact phone (digits only). */
export function whatsappLink(message?: string) {
  const digits = SITE.contactPhone.replace(/\D/g, '')
  const base = `https://wa.me/${digits}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export const FOOTER_LINKS = [
  { href: '/about', label: 'About us' },
  { href: '/contact', label: 'Contact us' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
] as const
