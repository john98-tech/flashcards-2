'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Eye, Keyboard, MousePointerClick, Pencil, Save, RotateCcw, Shuffle, X, Volume2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import { fromCloze, normalizeAnswer, parseCloze, toCloze, type Deck } from '@/lib/cloze'
import { saveCard } from '@/app/admin/actions'
import { renderRichInline } from '@/components/rich-inline'
import { loadStudentDeckProgress, saveStudentDeckProgress } from '@/app/decks/progress-actions'

type Mode = 'tap' | 'type'

type AudioWordTiming = { word: string; startMs: number; endMs: number }

function mapAudioWordRanges(source: string, timings: AudioWordTiming[]) {
  const ranges: { start: number; end: number; timingIndex: number }[] = []
  let offset = 0
  let timingIndex = 0
  for (const line of source.split('\n')) {
    const crumb = /^\s*>>/.test(line)
    const bullet = line.match(/^\s*\d+[.)]\s+/)
    if (!crumb) {
      const from = bullet ? bullet[0].length : 0
      const expression = /&|[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu
      expression.lastIndex = from
      for (const match of line.matchAll(expression)) {
        if (timingIndex >= timings.length) break
        const start = offset + (match.index ?? 0)
        ranges.push({ start, end: start + match[0].length, timingIndex })
        timingIndex++
      }
    }
    offset += line.length + 1
  }
  return ranges
}

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function StudySession({ deck, isAdmin = false }: { deck: Deck; isAdmin?: boolean }) {
  const storageKey = `sammaa-progress-${deck.id}`
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [queue, setQueue] = useState(() => deck.cards.map((c) => c.id))
  const [position, setPosition] = useState(0)
  const [mode, setMode] = useState<Mode>('tap')
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [baseQueue, setBaseQueue] = useState<string[] | null>(null)
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [adminEditMode, setAdminEditMode] = useState(false)
  const [adminTextEditing, setAdminTextEditing] = useState(false)
  const [adminTextDraft, setAdminTextDraft] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)
  const [adminStatus, setAdminStatus] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminOverrides, setAdminOverrides] = useState<Record<string, string>>({})
  const [adminSelected, setAdminSelected] = useState<Set<number>>(new Set())
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBusy, setAudioBusy] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [audioTimings, setAudioTimings] = useState<AudioWordTiming[]>([])
  const [activeAudioWord, setActiveAudioWord] = useState(-1)
  const [audioBatchBusy, setAudioBatchBusy] = useState(false)
  const [audioBatchProgress, setAudioBatchProgress] = useState({ done: 0, total: 0 })
  const audioRef = useRef<HTMLAudioElement>(null)
  const pendingAudioBlankRef = useRef<number | null>(null)
  const adminSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAdminSave = useRef<{ card: Deck['cards'][number]; cloze: string; position: number } | null>(null)
  const validCardIds = useMemo(() => new Set(deck.cards.map((item) => item.id)), [deck.cards])

  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      let local: { known?: string[]; queue?: string[]; position?: number; mode?: Mode; baseQueue?: string[] | null; revealed?: number[]; answers?: Record<number, string> } | null = null
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          local = Array.isArray(parsed) ? { known: parsed } : parsed
          if (local?.known) setKnown(new Set(local.known.filter((id) => validCardIds.has(id))))
          if (local?.queue?.length) setQueue(local.queue.filter((id) => validCardIds.has(id)))
          if (Number.isInteger(local?.position)) setPosition(Math.max(0, Math.min(local!.position!, deck.cards.length)))
          if (local?.mode === 'type' || local?.mode === 'tap') setMode(local.mode)
          if (Array.isArray(local?.baseQueue)) setBaseQueue(local.baseQueue.filter((id) => validCardIds.has(id)))
          if (Array.isArray(local?.revealed)) setRevealed(new Set(local.revealed.filter((n) => Number.isInteger(n) && n >= 0 && n < 500)))
          if (local?.answers && typeof local.answers === 'object') setAnswers(local.answers)
        }
      } catch {}
      try {
        const remote = await loadStudentDeckProgress(deck.id) as (Awaited<ReturnType<typeof loadStudentDeckProgress>> & { revealed?: number[]; answers?: Record<number, string> })
        if (cancelled) return
        if (remote) {
          // Merge known cards so a refresh during a slow network save never loses local progress.
          setKnown((current) => new Set([...current, ...(remote.known ?? []).filter((id) => validCardIds.has(id))]))
          if (!local?.queue?.length && remote.queue?.length) setQueue(remote.queue.filter((id) => validCardIds.has(id)))
          if (!local || !Number.isInteger(local.position)) setPosition(Math.max(0, Math.min(remote.position ?? 0, deck.cards.length)))
          if (!local?.mode && remote.mode) setMode(remote.mode)
          if (!local?.baseQueue && remote.baseQueue) setBaseQueue(remote.baseQueue.filter((id) => validCardIds.has(id)))
          if (!local?.revealed && remote.revealed) setRevealed(new Set(remote.revealed.filter((n) => Number.isInteger(n) && n >= 0 && n < 500)))
          if (!local?.answers && remote.answers) setAnswers(remote.answers)
        }
      } catch (error) {
        console.error('[study-progress] Could not load saved progress:', error)
      } finally {
        if (!cancelled) setProgressLoaded(true)
      }
    }
    void restore()
    return () => { cancelled = true }
  }, [storageKey, deck.id, deck.cards.length, validCardIds])

  useEffect(() => {
    if (!progressLoaded) return
    const snapshot = {
      known: [...known],
      queue: queue.filter((id) => validCardIds.has(id)),
      position,
      mode,
      baseQueue,
      revealed: [...revealed],
      answers,
    }
    try { localStorage.setItem(storageKey, JSON.stringify(snapshot)) } catch {}
    const timer = window.setTimeout(() => {
      void saveStudentDeckProgress(deck.id, snapshot).catch((error) => {
        console.error('[study-progress] Could not save progress:', error)
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [progressLoaded, storageKey, deck.id, known, queue, position, mode, baseQueue, revealed, answers, validCardIds])

  const cardsById = useMemo(() => new Map(deck.cards.map((c) => [c.id, adminOverrides[c.id] !== undefined ? { ...c, cloze: adminOverrides[c.id] } : c])), [deck.cards, adminOverrides])
  const card = cardsById.get(queue[position])
  const segments = useMemo(() => (card ? parseCloze(card.cloze) : []), [card])
  const adminParsed = useMemo(() => card ? fromCloze(card.cloze) : null, [card])
  const audioBlankByTiming = useMemo(() => {
    const positioned = segments.map((seg, index) => {
      const start = segments.slice(0, index).reduce((sum, item) => sum + item.value.length, 0)
      return { seg, start, end: start + seg.value.length }
    })
    const fullText = positioned.map((item) => item.seg.value).join('')
    const ranges = mapAudioWordRanges(fullText, audioTimings)
    const result = new Map<number, number>()
    for (const item of positioned) {
      if (item.seg.type !== 'blank') continue
      const range = ranges.find((candidate) => candidate.start >= item.start && candidate.end <= item.end)
      if (range) result.set(range.timingIndex, item.seg.index)
    }
    return result
  }, [segments, audioTimings])

  useEffect(() => {
    setAdminSelected(adminParsed?.selected ?? new Set())
  }, [card?.id, card?.cloze])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.currentTime = 0 }
    setAudioUrl(null)
    setAudioTimings([])
    setActiveAudioWord(-1)
    pendingAudioBlankRef.current = null
    setAudioError('')
    if (!card) return
    let cancelled = false
    fetch(`/api/card-audio?deckId=${encodeURIComponent(deck.id)}&cardId=${encodeURIComponent(card.id)}`)
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!cancelled && data?.url) { setAudioUrl(data.url); setAudioTimings(Array.isArray(data.timings) ? data.timings : []) } })
      .catch(() => {})
    return () => { cancelled = true; if (audio) { audio.pause(); audio.currentTime = 0 } }
  }, [card?.id, deck.id])

  const generateCardAudio = async () => {
    if (!card || audioBusy) return
    setAudioBusy(true); setAudioError('')
    try {
      const response = await fetch('/api/admin/card-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deckId: deck.id, cardId: card.id }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذر تجهيز الصوت.')
      setAudioUrl(data.url)
      setAudioTimings(Array.isArray(data.timings) ? data.timings : [])
    } catch (error) { setAudioError(error instanceof Error ? error.message : 'تعذر تجهيز الصوت.') }
    finally { setAudioBusy(false) }
  }

  const generateDeckAudio = async () => {
    if (audioBatchBusy) return
    setAudioBatchBusy(true)
    setAudioError('')
    setAudioBatchProgress({ done: 0, total: deck.cards.length })
    let completed = 0
    try {
      for (const item of deck.cards) {
        const response = await fetch('/api/admin/card-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckId: deck.id, cardId: item.id }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(`الكارد ${completed + 1}: ${data.error || 'تعذر تجهيز الصوت.'}`)
        completed++
        setAudioBatchProgress({ done: completed, total: deck.cards.length })
        if (item.id === card?.id && data.url) {
          setAudioUrl(data.url)
          setAudioTimings(Array.isArray(data.timings) ? data.timings : [])
        }
      }
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'توقف تجهيز أصوات الديك.')
    } finally {
      setAudioBatchBusy(false)
    }
  }

  // Reset messages only when navigating to a different card, not on each
  // optimistic text update; otherwise the status line flashes and changes height.
  useEffect(() => {
    setAdminStatus('')
    setAdminError('')
  }, [card?.id])

  const persistAdminCard = async (nextCloze: string) => {
    if (!isAdmin || !card) return false
    setAdminSaving(true)
    setAdminError('')
    setAdminStatus('')
    const nextCard = { ...card, cloze: nextCloze }
    try {
      await saveCard(deck.id, nextCard, deck.cards.findIndex((item) => item.id === card.id))
      setAdminOverrides((old) => ({ ...old, [card.id]: nextCloze }))
      setAdminStatus('تم الحفظ')
      return true
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'فشل الحفظ. حاول مرة أخرى.')
      return false
    } finally {
      setAdminSaving(false)
    }
  }

  const toggleAdminToken = (index: number) => {
    if (!isAdmin || !adminEditMode || !adminParsed || !card) return
    const next = new Set(adminSelected)
    if (next.has(index)) next.delete(index)
    else next.add(index)

    // Update the card immediately so the clicked word never flashes back while
    // waiting for the network. Batch rapid taps into one save of the latest state.
    const nextCloze = toCloze(adminParsed.text, adminParsed.tokens, next)
    setAdminSelected(next)
    setAdminOverrides((old) => ({ ...old, [card.id]: nextCloze }))
    pendingAdminSave.current = {
      card: { ...card },
      cloze: nextCloze,
      position: deck.cards.findIndex((item) => item.id === card.id),
    }
    setAdminError('')
    setAdminStatus('تعديلاتك محفوظة محليًا، جاري تجهيز الحفظ...')
    if (adminSaveTimer.current) clearTimeout(adminSaveTimer.current)
    adminSaveTimer.current = setTimeout(async () => {
      const pending = pendingAdminSave.current
      pendingAdminSave.current = null
      adminSaveTimer.current = null
      if (!pending) return
      setAdminSaving(true)
      setAdminStatus('جاري الحفظ...')
      setAdminError('')
      try {
        await saveCard(deck.id, { ...pending.card, cloze: pending.cloze }, pending.position)
        setAdminStatus('تم الحفظ')
      } catch (error) {
        setAdminError(error instanceof Error ? error.message : 'فشل الحفظ. حاول مرة أخرى.')
        setAdminStatus('')
      } finally {
        setAdminSaving(false)
      }
    }, 300)
  }

  const saveAdminText = async () => {
    // Flush any pending word edits first so an older queued save cannot overwrite
    // the text the admin is saving now.
    if (adminSaveTimer.current) {
      clearTimeout(adminSaveTimer.current)
      adminSaveTimer.current = null
      const pending = pendingAdminSave.current
      pendingAdminSave.current = null
      if (pending) {
        try {
          await saveCard(deck.id, { ...pending.card, cloze: pending.cloze }, pending.position)
        } catch (error) {
          setAdminError(error instanceof Error ? error.message : 'فشل حفظ تعديل الكلمات.')
          return
        }
      }
    }
    const saved = await persistAdminCard(adminTextDraft)
    if (saved) setAdminTextEditing(false)
  }
  const blankCount = segments.filter((s) => s.type === 'blank').length
  const allRevealed = revealed.size >= blankCount

  const resetCard = () => {
    setRevealed(new Set())
    setAnswers({})
  }

  const nextHidden = Array.from({ length: blankCount }, (_, i) => i).find((i) => !revealed.has(i))

  const revealOne = (index: number) => {
    if (revealed.has(index)) return
    sfx.reveal(index)
    setRevealed((r) => new Set(r).add(index))
    if (pendingAudioBlankRef.current === index) {
      pendingAudioBlankRef.current = null
      void audioRef.current?.play()
    }
  }

  const revealNext = () => {
    if (nextHidden !== undefined) revealOne(nextHidden)
  }

  const revealAll = () => {
    if (allRevealed) return
    sfx.revealAll()
    setRevealed(new Set(Array.from({ length: blankCount }, (_, i) => i)))
    if (pendingAudioBlankRef.current !== null) {
      pendingAudioBlankRef.current = null
      void audioRef.current?.play()
    }
  }

  const startSession = (ids: string[], shuffled = false) => {
    sfx.flip()
    setQueue(shuffled ? shuffle(ids) : ids)
    setPosition(0)
    resetCard()
    setBaseQueue(null)
  }

  const toggleShuffle = () => {
    if (baseQueue) return startSession(baseQueue)
    const original = queue
    startSession(queue, true)
    setBaseQueue(original)
  }

  const goTo = (delta: number) => {
    const target = Math.min(Math.max(position + delta, 0), queue.length)
    if (target === position) return
    sfx.flip()
    setPosition(target)
    resetCard()
  }

  const rate = (gotIt: boolean) => {
    if (!card) return
    const next = new Set(known)
    if (gotIt) next.add(card.id)
    else next.delete(card.id)
    setKnown(next)
    localStorage.setItem(storageKey, JSON.stringify([...next]))
    if (gotIt) sfx.correct()
    else sfx.wrong()
    if (position + 1 >= queue.length) setTimeout(() => sfx.fanfare(), 250)
    else setTimeout(() => sfx.flip(), 120)
    setPosition((p) => p + 1)
    resetCard()
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    resetCard()
  }

  const handleKey = useEffectEvent((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key.toLowerCase()
    const isRtl = document.documentElement.dir === 'rtl'
    const forward = isRtl ? 'arrowleft' : 'arrowright'
    const backward = isRtl ? 'arrowright' : 'arrowleft'

    if (key === forward || key === 'n') return e.preventDefault(), goTo(1)
    if (key === backward || key === 'p') return e.preventDefault(), goTo(-1)
    if (allRevealed && (key === 'arrowup' || key === 'enter' || key === '2')) return e.preventDefault(), rate(true)
    if (allRevealed && (key === 'arrowdown' || key === 'backspace' || key === '1')) return e.preventDefault(), rate(false)
    if (key === 't') return e.preventDefault(), switchMode(mode === 'tap' ? 'type' : 'tap')
    if (key === 's') return e.preventDefault(), toggleShuffle()
    // ArrowDown is only the "لسه" rating shortcut when the rating buttons are visible.
    // Never use it to reveal blanks; Space reveals the next blank and A reveals all.
    if (key === 'arrowdown') return e.preventDefault()
    if (e.code === 'Space') {
      e.preventDefault()
      if (mode === 'type') return revealAll()
      return allRevealed ? undefined : revealNext()
    }
    if (key === 'arrowup') return e.preventDefault()
    if (key === 'a') return e.preventDefault(), revealAll()
    if (key === 'r') return e.preventDefault(), resetCard()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleKey(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const remaining = deck.cards.filter((c) => !known.has(c.id)).map((c) => c.id)
  const progress = Math.round((known.size / deck.cards.length) * 100)

  return (
    <>
    <div className="study-session-page flex flex-col gap-4">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2">
          <Button type="button" size="sm" variant={adminEditMode ? 'default' : 'outline'} aria-pressed={adminEditMode} onClick={() => { setAdminEditMode((value) => !value); setAdminTextEditing(false); setAdminStatus(''); setAdminError('') }}>
            <Pencil aria-hidden /> {adminEditMode ? 'إيقاف Edit Mode' : 'Edit Mode'}
          </Button>
          {adminEditMode && <Button type="button" size="sm" variant="outline" disabled={adminSaving || !card} onClick={() => { setAdminTextDraft(card?.cloze ?? ''); setAdminTextEditing(true) }}>Edit text</Button>}
          <span aria-live="polite" className="flex min-h-10 flex-1 items-center text-xs leading-5 text-muted-foreground sm:min-h-5">{adminSaving || adminStatus === 'جاري الحفظ...' ? 'جاري الحفظ...' : adminError ? 'تعذّر الحفظ' : adminStatus === 'تم الحفظ' ? 'تم الحفظ' : adminEditMode ? 'التعديل يُحفظ تلقائيًا' : 'وضع تعديل خاص بالأدمن'}</span>
          {adminError && <span role="alert" className="w-full text-xs text-destructive">{adminError}</span>}
        </div>
      )}
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="flex w-full items-center gap-1 rounded-lg border bg-card p-1 sm:w-auto" role="group" aria-label="طريقة التسميع">
          <ModeButton active={mode === 'tap'} onClick={() => switchMode('tap')}>
            <MousePointerClick className="size-4" aria-hidden /> اضغط واكشف
          </ModeButton>
          <ModeButton active={mode === 'type'} onClick={() => switchMode('type')} data-tour="study-type-mode" data-tour-action="select-type-mode">
            <Keyboard className="size-4" aria-hidden /> اكتب الإجابة
          </ModeButton>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            variant={baseQueue ? 'default' : 'outline'}
            size="sm"
            aria-pressed={!!baseQueue}
            onClick={toggleShuffle}
            data-tour="study-shuffle"
            data-tour-action="shuffle-cards"
          >
            {baseQueue ? <RotateCcw aria-hidden /> : <Shuffle aria-hidden />}
            {baseQueue ? 'رجّع الترتيب' : 'لخبط الترتيب'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={remaining.length === 0}
            onClick={() => startSession(remaining)}
          >
            راجع اللي لسه ({remaining.length})
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          data-tour="study-progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="نسبة الحفظ"
        >
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span>
          حفظت {known.size} من {deck.cards.length}
        </span>
      </div>

      {card ? (
        <article key={`${card.id}-${position}`} className="card-flip rounded-2xl border bg-card/95 p-4 shadow-lg backdrop-blur sm:p-6 md:p-8">
          <div className="mb-5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goTo(-1)}
                disabled={position === 0}
                aria-label="الكارت اللي فات"
                className="flex size-7 items-center justify-center rounded-full border transition-colors hover:bg-accent disabled:opacity-40"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <span className="px-1">
                كارت {position + 1} من {queue.length}
              </span>
              <button
                type="button"
                onClick={() => goTo(1)}
                aria-label="الكارت اللي بعده"
                className="flex size-7 items-center justify-center rounded-full border transition-colors hover:bg-accent"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && <Button type="button" size="sm" variant="outline" disabled={audioBusy || audioBatchBusy} onClick={() => void generateCardAudio()}>{audioBusy ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />} {audioBusy ? 'جاري تجهيز الصوت' : audioUrl ? 'إعادة تجهيز الصوت' : 'تجهيز صوت الكارد'}</Button>}
              {isAdmin && <Button type="button" size="sm" variant="outline" disabled={audioBusy || audioBatchBusy} onClick={() => void generateDeckAudio()}>{audioBatchBusy ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />} {audioBatchBusy ? `تجهيز ${audioBatchProgress.done}/${audioBatchProgress.total}` : 'تجهيز صوت الديك كله'}</Button>}
              {audioUrl && <Button type="button" size="sm" variant="outline" onClick={() => { const audio = audioRef.current; if (audio) { audio.currentTime = 0; void audio.play() } }}><Volume2 className="size-4" /> استمع</Button>}
              {known.has(card.id) && <span className="flex items-center gap-1 text-success"><Check className="size-3.5" aria-hidden /> محفوظ</span>}
            </div>
          </div>
          <audio ref={audioRef} src={audioUrl ?? undefined} preload="none" className="hidden" onTimeUpdate={(event) => {
            const now = event.currentTarget.currentTime * 1000
            const index = audioTimings.findIndex((item) => now >= item.startMs && now <= item.endMs)
            if (index !== activeAudioWord) setActiveAudioWord(index)
            const blankIndex = index >= 0 ? audioBlankByTiming.get(index) : undefined
            if (blankIndex !== undefined && !revealed.has(blankIndex)) {
              pendingAudioBlankRef.current = blankIndex
              event.currentTarget.pause()
            }
          }} />
          {audioError && <p role="alert" className="mb-3 text-xs text-destructive">{audioError}</p>}

          {(() => {
            let offset = 0
            const positioned = segments.map((seg) => {
              const item = { seg, start: offset, end: offset + seg.value.length }
              offset = item.end
              return item
            })
            const fullText = positioned.map((item) => item.seg.value).join('')
            const audioWordRanges = mapAudioWordRanges(fullText, audioTimings)
            const lines: { value: string; start: number; end: number }[] = []
            let lineOffset = 0
            for (const value of fullText.split('\n')) {
              lines.push({ value, start: lineOffset, end: lineOffset + value.length })
              lineOffset += value.length + 1
            }
            const isTableRow = (value: string) => /^\s*\|.*\|\s*$/.test(value)
            const isDivider = (value: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(value)
            const renderPlainRange = (start: number, end: number) => positioned.filter((item) => item.end > start && item.start < end).map(({ seg, start: segStart, end: segEnd }, i) => {
              if (seg.type === 'text') {
                const rangeStart = Math.max(start, segStart)
                const rangeEnd = Math.min(end, segEnd)
                if (isAdmin && adminEditMode && adminParsed) {
                  return adminParsed.tokens.filter((token) => token.end > rangeStart && token.start < rangeEnd).map((token) => {
                    const tokenIndex = adminParsed.tokens.indexOf(token)
                    const from = Math.max(rangeStart, token.start)
                    const to = Math.min(rangeEnd, token.end)
                    const value = adminParsed.text.slice(from, to)
                    const isWord = !token.space && /[\p{L}\p{N}]/u.test(token.text)
                    if (!isWord || from !== token.start || to !== token.end) return <span key={'edit-txt-' + token.start}>{value}</span>
                    const hidden = adminSelected.has(tokenIndex)
                    return <button key={'edit-word-' + token.start} type="button" onClick={() => toggleAdminToken(tokenIndex)} aria-label={(hidden ? 'إظهار ' : 'إخفاء ') + token.text} className={cn('mx-0.5 rounded px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', hidden ? 'border-b-2 border-primary/60 text-transparent select-none hover:bg-primary/10' : 'hover:bg-primary/10 underline decoration-dotted underline-offset-4')}>{token.text}</button>
                  })
                }
                const from = rangeStart - segStart
                const to = rangeEnd - segStart
                const audioParts: React.ReactNode[] = []
                let cursor = rangeStart
                for (const wordRange of audioWordRanges) {
                  if (wordRange.end <= rangeStart || wordRange.start >= rangeEnd) continue
                  if (wordRange.start > cursor) audioParts.push(<span key={`plain-${cursor}`}>{fullText.slice(cursor, wordRange.start)}</span>)
                  const timing = audioTimings[wordRange.timingIndex]
                  audioParts.push(
                    <button
                      key={`audio-word-${wordRange.start}`}
                      type="button"
                      onClick={() => {
                        const audio = audioRef.current
                        if (audio && timing) {
                          audio.currentTime = timing.startMs / 1000
                          setActiveAudioWord(wordRange.timingIndex)
                          void audio.play()
                        }
                      }}
                      className={cn('rounded-sm transition-colors', activeAudioWord === wordRange.timingIndex && 'bg-primary/20 text-primary ring-1 ring-primary/30')}
                      aria-label={`ابدأ القراءة من ${fullText.slice(wordRange.start, wordRange.end)}`}
                    >{fullText.slice(wordRange.start, wordRange.end)}</button>,
                  )
                  cursor = wordRange.end
                }
                if (cursor < rangeEnd) audioParts.push(<span key={`plain-${cursor}`}>{fullText.slice(cursor, rangeEnd)}</span>)
                return audioParts.length
                  ? <span key={'t-' + segStart + '-' + i}>{audioParts}</span>
                  : <span key={'t-' + segStart + '-' + i}>{seg.value.slice(from, to)}</span>
              }
              if (segStart < start || segEnd > end) return <span key={'b-' + seg.index}>{seg.value}</span>
              if (isAdmin && adminEditMode && adminParsed) {
                const tokenIndex = adminParsed.tokens.findIndex((token) => token.start === segStart && token.end === segEnd && !token.space)
                if (tokenIndex >= 0) {
                  const hidden = adminSelected.has(tokenIndex)
                  return <button key={'edit-blank-' + seg.index} type="button" onClick={() => toggleAdminToken(tokenIndex)} className={cn('mx-0.5 rounded px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', hidden ? 'border-b-2 border-primary/60 text-transparent select-none hover:bg-primary/10' : 'hover:bg-primary/10 underline decoration-dotted underline-offset-4')}>{seg.value}</button>
                }
              }
              const isOpen = revealed.has(seg.index)
              if (mode === 'type') return <TypedBlank key={card.id + '-' + seg.index} answer={seg.value} value={answers[seg.index] ?? ''} checked={isOpen} onChange={(v) => setAnswers((a) => ({ ...a, [seg.index]: v }))} onCheck={(correct) => { if (correct) sfx.correct(); else sfx.wrong(); setRevealed((r) => new Set(r).add(seg.index)) }} />
              return <button key={seg.index} type="button" data-no-click-sound data-tour="study-reveal" data-tour-action="reveal-word" onClick={() => revealOne(seg.index)} aria-label={isOpen ? seg.value : 'فراغ رقم ' + (seg.index + 1) + '، اضغط للكشف'} className={cn('mx-0.5 inline-block rounded-md px-1.5 align-baseline leading-normal transition-colors', isOpen ? 'word-pop bg-highlight font-semibold text-highlight-foreground' : 'border-b-2 border-dashed border-primary bg-accent text-transparent hover:bg-accent/70', !isOpen && seg.index === nextHidden && 'blank-next')} style={isOpen ? undefined : { minWidth: Math.min(Math.max(seg.value.length, 4), 24) + 'ch' }}>{isOpen ? seg.value : '\\u00A0'}</button>
            })
            const renderRange = (start: number, end: number) => renderRichInline(fullText, start, end, renderPlainRange, `study-${start}-${end}`)
            const HEADING_CLASS = [
  'mt-3 text-2xl font-extrabold leading-snug sm:text-3xl',
  'mt-2 text-xl font-bold leading-snug sm:text-2xl',
  'mt-1 text-lg font-semibold leading-snug sm:text-xl',
  'text-base font-semibold leading-snug text-muted-foreground sm:text-lg',
]
const renderLine = (line: { value: string; start: number; end: number }, key: number) => {
  const lead = line.value.match(/^[ \t]*/)![0]
  const rest = line.value.slice(lead.length)
  const level = Math.min(Math.floor(lead.replace(/\t/g, '    ').length / 2), 6)
  const indent = level ? { paddingInlineStart: `${level * 1.25}rem` } : undefined
  const contentStart = line.start + lead.length

  const crumb = rest.match(/^>>\s*/)
  if (crumb) {
    const parts = fullText.slice(contentStart + crumb[0].length, line.end)
      .split(/\s*>\s*/).map((p) => p.trim()).filter(Boolean)
    return (
      <div key={key} dir="auto" className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b pb-3 text-xs leading-normal text-muted-foreground sm:text-sm">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="opacity-50">›</span>}
            <span className={i === parts.length - 1 ? 'font-semibold text-foreground/80' : undefined}>{part}</span>
          </span>
        ))}
      </div>
    )
  }
  const heading = rest.match(/^(#{1,4})\s+(?=\S)/)
  if (heading) {
    return <div key={key} className={HEADING_CLASS[heading[1].length - 1]} style={indent}>{renderRange(contentStart + heading[0].length, line.end)}</div>
  }
  const bullet = rest.match(/^([-*•]|\d+[.)])\s+(?=\S)/)
  if (bullet) {
    const marker = /^\d/.test(bullet[1]) ? bullet[1] : '•'
    return (
      <div key={key} className="flex gap-2" style={indent}>
        <span aria-hidden className="select-none font-semibold text-primary">{marker}</span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap">{renderRange(contentStart + bullet[0].length, line.end)}</span>
      </div>
    )
  }
  return <div key={key} className="whitespace-pre-wrap" style={indent}>{renderRange(contentStart, line.end)}</div>
}
            const blocks: { type: 'line' | 'table' | 'diagram'; lines: typeof lines }[] = []
            for (let i = 0; i < lines.length;) {
              if (i + 1 < lines.length && isTableRow(lines[i].value) && isDivider(lines[i + 1].value)) {
                const rows = [lines[i], lines[i + 1]]
                i += 2
                while (i < lines.length && isTableRow(lines[i].value)) rows.push(lines[i++])
                blocks.push({ type: 'table', lines: rows.filter((line, index) => index !== 1) })
              } else if (/^\s*[│├└┌┐┘┬┴─┼]/.test(lines[i].value)) {
                const rows = [lines[i++]]
                while (i < lines.length && /^\s*[│├└┌┐┘┬┴─┼]/.test(lines[i].value)) rows.push(lines[i++])
                blocks.push({ type: 'diagram', lines: rows })
              } else blocks.push({ type: 'line', lines: [lines[i++]] })
            }
            return <div dir="auto" className="space-y-2 text-base leading-[2.3] sm:text-lg sm:leading-[2.4] md:text-xl">
              {blocks.map((block, bi) => block.type === 'table' ? <WideTable key={bi}><table className="w-max min-w-[760px] border-collapse text-sm sm:text-base"><tbody>{block.lines.map((line, ri) => {
                const cells = line.value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
                let cursor = line.value.indexOf(line.value.trim().replace(/^\|/, '').split('|')[0])
                return <tr key={ri} className={ri === 0 ? 'bg-muted/70 font-semibold' : 'border-t'}>{cells.map((cell, ci) => {
                  const at = line.value.indexOf(cell, cursor)
                  const cellStart = line.start + (at >= 0 ? at : 0)
                  cursor = (at >= 0 ? at : cursor) + cell.length + 1
                  return <td key={ci} className="border-e px-3 py-2 align-top whitespace-normal break-words [overflow-wrap:break-word] last:border-e-0">{renderRange(cellStart, cellStart + cell.length)}</td>
                })}</tr>
              })}</tbody></table></WideTable> : block.type === 'diagram' ? <pre key={bi} className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">{block.lines.map((line, i) => <span key={i}>{renderRange(line.start, line.end)}{i < block.lines.length - 1 ? '\n' : ''}</span>)}</pre> : renderLine(block.lines[0], bi))}
            </div>
          })()}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            {allRevealed ? (
              <div className="flex w-full gap-3">
                <Button size="lg" variant="outline" className="flex-1" onClick={() => rate(false)}>
                  <X aria-hidden /> لسه <kbd className="ms-1 rounded border px-1 text-[10px] opacity-60">↓</kbd>
                </Button>
                <Button size="lg" className="flex-1 bg-success text-primary-foreground hover:bg-success/90" onClick={() => rate(true)}>
                  <Check aria-hidden /> حفظتها <kbd className="ms-1 rounded border border-current/40 px-1 text-[10px] opacity-70">↑</kbd>
                </Button>
              </div>
            ) : (
              <>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {mode === 'tap'
                    ? 'Space الكلمة التالية · A الكل · ↑ أو Enter أو 2 حفظتها · ↓ أو Backspace أو 1 لسه · الأسهم للتنقل · T الوضع · S خلط · R إعادة'
                    : 'اكتب واضغط Enter للتصحيح · Space لكشف الكل · T لتغيير الوضع · S لخلط الكروت'}
                </span>
                <Button size="lg" className="w-full sm:w-auto" onClick={revealAll}>
                  <Eye aria-hidden /> اكشف الكل
                </Button>
              </>
            )}
          </div>
        </article>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-10 text-center">
          <h2 className="text-xl font-bold">خلصت الجولة</h2>
          <p className="text-muted-foreground">
            حفظت {known.size} كارت من {deck.cards.length}.{' '}
            {remaining.length > 0 ? `فاضل ${remaining.length} محتاجين مراجعة.` : 'الكتاب كله محفوظ.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {remaining.length > 0 && <Button onClick={() => startSession(remaining)}>راجع اللي لسه</Button>}
            <Button variant="outline" onClick={() => startSession(deck.cards.map((c) => c.id))}>
              <RotateCcw aria-hidden /> من الأول
            </Button>
          </div>
        </div>
      )}
    </div>
    {isAdmin && adminTextEditing && card && (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="study-admin-edit-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-2xl sm:p-6">
          <h2 id="study-admin-edit-title" className="font-semibold">Edit card text</h2>
          <p className="text-sm text-muted-foreground">عدّل النص كما تريد. احتفظ بـ {'{{'} و {'}}'} حول الكلمات التي تريد إخفاءها.</p>
          <textarea autoFocus dir="auto" value={adminTextDraft} onChange={(event) => setAdminTextDraft(event.target.value)} rows={10} className="w-full rounded-lg border bg-background p-3 text-sm leading-7" />
          {adminError && <p role="alert" className="text-sm text-destructive">{adminError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={adminSaving} onClick={() => setAdminTextEditing(false)}>إلغاء</Button>
            <Button type="button" disabled={adminSaving} onClick={() => void saveAdminText()}><Save aria-hidden /> {adminSaving ? 'جاري الحفظ...' : 'حفظ النص'}</Button>
          </div>
        </section>
      </div>
    )}
    </>
  )
}

function ModeButton({ active, children, onClick, ...attrs }: { active: boolean; children: React.ReactNode; onClick: () => void; 'data-tour'?: string; 'data-tour-action'?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...attrs}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors sm:flex-none sm:px-3 sm:text-sm',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function TypedBlank({
  answer,
  value,
  checked,
  onChange,
  onCheck,
}: {
  answer: string
  value: string
  checked: boolean
  onChange: (v: string) => void
  onCheck: (correct: boolean) => void
}) {
  const check = () => onCheck(normalizeAnswer(value) === normalizeAnswer(answer))
  const correct = checked && normalizeAnswer(value) === normalizeAnswer(answer)
  const width = `${Math.min(Math.max(answer.length, 4), 24) + 2}ch`

  if (checked) {
    return (
      <span className="mx-0.5 inline-flex flex-wrap items-baseline gap-1 leading-normal">
        {correct ? (
          <span className="rounded-md bg-success/15 px-1.5 font-semibold text-success">{answer}</span>
        ) : (
          <>
            {value && <span className="rounded-md bg-destructive/10 px-1.5 text-destructive line-through">{value}</span>}
            <span className="rounded-md bg-highlight px-1.5 font-semibold text-highlight-foreground">{answer}</span>
          </>
        )}
      </span>
    )
  }

  return (
    <input
      dir="auto"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (e.key === 'Enter') check()
      }}
      onBlur={() => value.trim() && check()}
      aria-label="اكتب الكلمة الناقصة"
      className="mx-0.5 inline-block rounded-md border-b-2 border-primary bg-accent px-1.5 text-base leading-normal outline-none focus:ring-2 focus:ring-ring"
      style={{ width }}
    />
  )
}

function WideTable({ children }: { children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState(false)
  const [canGoLeft, setCanGoLeft] = useState(false)
  const [canGoRight, setCanGoRight] = useState(false)

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const update = () => {
      const max = element.scrollWidth - element.clientWidth
      setCanScroll(max > 2)
      // Use the browser's physical scroll position so the side controls always
      // move toward the side the user clicked, including in RTL layouts.
      const rtl = getComputedStyle(element).direction === 'rtl'
      const position = rtl
        ? Math.max(0, Math.min(max, -element.scrollLeft))
        : Math.max(0, Math.min(max, element.scrollLeft))
      setCanGoLeft(position > 2)
      setCanGoRight(position < max - 2)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    element.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [children])

  const move = (direction: 'left' | 'right') => {
    const element = scroller.current
    if (!element) return
    // Small repeated steps make wide tables easier to inspect without jumping
    // across several columns at once.
    const step = Math.min(180, Math.max(100, element.clientWidth * 0.28))
    const rtl = getComputedStyle(element).direction === 'rtl'
    const physicalDirection = direction === 'left' ? -1 : 1
    element.scrollBy({
      left: physicalDirection * step * (rtl ? -1 : 1),
      behavior: 'smooth',
    })
  }

  const sideButtonClass = 'pointer-events-auto flex size-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-background/65 text-foreground shadow-lg backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-background/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-0'

  return (
    <div className="group/wide-table relative my-2 min-w-0 max-w-full overflow-hidden rounded-xl border bg-card/60 shadow-sm">
      <div
        ref={scroller}
        className="max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
      >
        {children}
      </div>
      {canScroll && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center bg-gradient-to-r from-background/50 via-background/20 to-transparent px-1.5 sm:px-2">
            <button
              type="button"
              onClick={() => move('left')}
              disabled={!canGoLeft}
              aria-label="حرّك الجدول للشمال خطوة"
              title="تحريك خطوة للشمال"
              className={sideButtonClass}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center bg-gradient-to-l from-background/50 via-background/20 to-transparent px-1.5 sm:px-2">
            <button
              type="button"
              onClick={() => move('right')}
              disabled={!canGoRight}
              aria-label="حرّك الجدول لليمين خطوة"
              title="تحريك خطوة لليمين"
              className={sideButtonClass}
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
