import { whatsappLink } from '@/lib/site'

export function WhatsAppButton() {
  return (
    <a
      href={whatsappLink('Hello, I have a question about Kart w Ketab')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      title="Chat on WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <svg viewBox="0 0 32 32" className="size-8" fill="currentColor" aria-hidden>
        <path d="M16.003 3.2C8.94 3.2 3.2 8.94 3.2 16c0 2.25.59 4.45 1.71 6.39L3.2 28.8l6.57-1.72A12.74 12.74 0 0 0 16 28.8c7.06 0 12.8-5.74 12.8-12.8S23.06 3.2 16.003 3.2Zm0 23.4c-1.92 0-3.8-.52-5.44-1.5l-.39-.23-3.9 1.02 1.04-3.8-.25-.4A10.55 10.55 0 0 1 5.4 16c0-5.84 4.76-10.6 10.6-10.6S26.6 10.16 26.6 16s-4.76 10.6-10.6 10.6Zm5.82-7.93c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.58-.95-.85-1.59-1.9-1.78-2.22-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66s1.15 3.08 1.3 3.3c.16.21 2.25 3.44 5.46 4.82.76.33 1.36.53 1.82.68.77.24 1.46.21 2.01.13.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z" />
      </svg>
    </a>
  )
}
