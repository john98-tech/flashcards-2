'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'

export function MobileContactMenu() {
  const [isStudyPage, setIsStudyPage] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const updatePage = () => {
      const next = Boolean(document.querySelector('.study-session-page, [data-handwriting-editor]'))
      setIsStudyPage(next)
      if (!next) {
        setOpen(false)
        document.body.classList.remove('mobile-contact-menu-open')
      }
    }
    updatePage()
    const observer = new MutationObserver(updatePage)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      document.body.classList.remove('mobile-contact-menu-open')
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('mobile-contact-menu-open', isStudyPage && open)
    return () => document.body.classList.remove('mobile-contact-menu-open')
  }, [isStudyPage, open])

  if (!isStudyPage) return null

  return (
    <button
      type="button"
      className="mobile-contact-menu-trigger"
      onClick={() => setOpen(value => !value)}
      aria-label={open ? 'إغلاق قائمة التواصل' : 'فتح قائمة التواصل'}
      aria-expanded={open}
      title={open ? 'إغلاق قائمة التواصل' : 'خيارات التواصل'}
    >
      {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
      <span className="sr-only">{open ? 'إغلاق قائمة التواصل' : 'خيارات التواصل'}</span>
    </button>
  )
}
