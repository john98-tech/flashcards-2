'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Music, Settings, Volume2, VolumeX, Waves } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sfx, unlockAudio, updateSoundSettings, useSoundSettings } from '@/lib/sound'

const SHORTCUTS: [string, string][] = [
  ['Space', 'اكشف الكلمة التالية (في وضع الضغط) أو صحّح الإجابة (في وضع الكتابة)'],
  ['A', 'اكشف كل الكلمات / الفراغات'],
  ['↑ / Enter / 2', 'حفظتها — بعد ظهور أزرار التقييم'],
  ['↓ / Backspace / 1', 'لسه — بعد ظهور أزرار التقييم فقط؛ السهم ↓ لا يكشف الفراغات'],
  ['→ / ←', 'الكارت التالي / السابق (حسب اتجاه الصفحة)'],
  ['N / P', 'التالي / السابق'],
  ['T', 'التبديل بين وضع الضغط ووضع الكتابة'],
  ['S', 'خلط ترتيب الكروت / استعادة الترتيب الأصلي'],
  ['R', 'إعادة إخفاء إجابات الكارت الحالي'],
  ['M', 'كتم / تشغيل الصوت (إن كان الاختصار مفعّلًا)'],
]

export function SettingsMenu({ showTutorialButton = true }: { showTutorialButton?: boolean }) {
  const [open, setOpen] = useState(false)
  const settings = useSoundSettings()
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setPanelPosition(null)
      return
    }

    const placePanel = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return
      const anchor = trigger.getBoundingClientRect()
      const width = Math.min(288, window.innerWidth - 16)
      const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))
      const height = Math.min(panel.scrollHeight, window.innerHeight - 16)
      const top = Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - height - 8))
      setPanelPosition({ top, left })
    }

    placePanel()
    window.addEventListener('resize', placePanel)
    window.addEventListener('scroll', placePanel, true)
    return () => {
      window.removeEventListener('resize', placePanel)
      window.removeEventListener('scroll', placePanel, true)
    }
  }, [open])

  const toggle = (patch: Parameters<typeof updateSoundSettings>[0]) => {
    unlockAudio()
    updateSoundSettings(patch)
    sfx.toggle()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Settings"
        data-tour="settings-trigger"
        data-tour-action="open-settings"
        className="relative flex size-9 items-center justify-center rounded-full border bg-card/70 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
      >
        <Settings className={cn('size-4 transition-transform duration-500', open && 'rotate-90')} aria-hidden />
        {settings.muted && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-destructive" />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Settings"
          data-tour="settings-panel"
          style={{ position: 'fixed', top: panelPosition?.top ?? 8, left: panelPosition?.left ?? 8, width: 'min(18rem, calc(100vw - 1rem))', maxHeight: 'calc(100dvh - 1rem)', overflowY: 'auto', overscrollBehavior: 'contain' }}
          className="pop-in z-[100] rounded-2xl border bg-card/95 p-4 shadow-xl backdrop-blur-md"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sound</p>
          <div className="flex flex-col gap-1">
            <ToggleRow
              icon={settings.muted ? VolumeX : Volume2}
              label="Mute everything"
              checked={settings.muted}
              onChange={(v) => toggle({ muted: v })}
            />
            <ToggleRow
              icon={Music}
              label="Background music"
              checked={settings.music}
              disabled={settings.muted}
              onChange={(v) => toggle({ music: v })}
            />
            <ToggleRow
              icon={Waves}
              label="Sound effects"
              checked={settings.sfx}
              disabled={settings.muted}
              onChange={(v) => toggle({ sfx: v })}
            />
            <label className="mt-2 flex items-center gap-3 px-2 text-sm">
              <span className="w-14 text-muted-foreground">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                disabled={settings.muted}
                onChange={(e) => updateSoundSettings({ volume: Number(e.target.value) })}
                onPointerUp={() => sfx.reveal(2)}
                className="flex-1 accent-primary"
              />
            </label>
          </div>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            اختصارات لوحة المفاتيح
          </p>
          <dl data-tour="settings-shortcuts" className="flex flex-col gap-1.5 text-xs">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
          {showTutorialButton && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                window.dispatchEvent(new CustomEvent('sammaa-tour-restart'))
              }}
              className="mt-4 w-full rounded-lg border px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent"
            >
              Start guided tour again
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-no-click-sound
      className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-40"
    >
      <Icon className="size-4 text-primary" />
      <span className="flex-1 text-left">{label}</span>
      <span
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-card shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}
