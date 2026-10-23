'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getSoundSettings, refreshMusic, sfx, unlockAudio, updateSoundSettings } from '@/lib/sound'

const INTERACTIVE = 'button, a, [role="button"], summary, label, select'

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function SoundEngine() {
  const pathname = usePathname()
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    sfx.whoosh()
  }, [pathname])

  useEffect(() => {
    let lastHovered: Element | null = null

    const onPointerDown = (e: PointerEvent) => {
      unlockAudio()
      const el = (e.target as Element | null)?.closest?.(INTERACTIVE)
      if (el && !el.closest('[data-no-click-sound]')) sfx.click()
    }
    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null
      if (el && el !== lastHovered) sfx.hover()
      lastHovered = el
    }
    const onKeyDown = (e: KeyboardEvent) => {
      unlockAudio()
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'm') {
        updateSoundSettings({ muted: !getSoundSettings().muted })
        sfx.toggle()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', refreshMusic)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', refreshMusic)
    }
  }, [])

  return null
}
