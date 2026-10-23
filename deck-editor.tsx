'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, ClipboardPaste, CloudUpload, Copy, Download, Eraser, ListChecks, Loader2, Scissors, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { applyTerms, countBlanks, parseTerms, type Card, type Deck } from '@/lib/cloze'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { createDeckGroup, deleteCards, deleteDeck, finishDeckSave, loadDeck, moveDeckToGroup, saveCard, saveDeckMeta } from '@/app/admin/actions'
import { CardEditor } from './card-editor'
import { SourcePanel } from './source-panel'

const PAGE_SIZE = 20
const emptyDeck: Deck = { id: '', groupId: 'ungrouped', title: '', subject: '', description: '', isFree: true, cards: [] }

type SaveState = { status: 'idle' } | { status: 'saving'; done: number; total: number } | { status: 'done' } | { status: 'error'; message: string }
type MoveState = { status: 'idle' } | { status: 'moving' } | { status: 'done' } | { status: 'error'; message: string }

export function DeckEditor({ existingDecks, existingGroups }: { existingDecks: DeckSummary[]; existingGroups: DeckGroup[] }) {
  const router = useRouter()
  const [deck, setDeck] = useState<Deck>(emptyDeck)
  const [groups, setGroups] = useState(existingGroups)
  const [selectedGroupId, setSelectedGroupId] = useState(existingGroups[0]?.id ?? '')
  const [moveDeckId, setMoveDeckId] = useState('')
  const [moveTargetGroupId, setMoveTargetGroupId] = useState(existingGroups[0]?.id ?? '')
  const [terms, setTerms] = useState('')
  const [page, setPage] = useState(0)
  const [active, setActive] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [groupError, setGroupError] = useState('')
  const [loadingDeck, setLoadingDeck] = useState(false)
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const [move, setMove] = useState<MoveState>({ status: 'idle' })
  const savedIds = useRef<{ deckId: string; ids: string[] } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const pageCount = Math.max(1, Math.ceil(deck.cards.length / PAGE_SIZE))
  const visible = deck.cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const stats = useMemo(() => {
    const counts = deck.cards.map((c) => countBlanks(c.cloze))
    return { blanks: counts.reduce((a, b) => a + b, 0), empty: counts.filter((n) => n === 0).length }
  }, [deck.cards])

  const setCards = (update: (cards: Card[]) => Card[]) => setDeck((d) => ({ ...d, cards: update(d.cards) }))

  const changeCard = useCallback((id: string, cloze: string) => {
    setDeck((d) => ({ ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, cloze } : c)) }))
  }, [])
  const deleteCard = useCallback((id: string) => {
    setDeck((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== id) }))
  }, [])
  const mergeNext = useCallback((id: string) => {
    setDeck((d) => {
      const i = d.cards.findIndex((c) => c.id === id)
      if (i < 0 || i >= d.cards.length - 1) return d
      const merged = { ...d.cards[i], cloze: `${d.cards[i].cloze} ${d.cards[i + 1].cloze}` }
      return { ...d, cards: [...d.cards.slice(0, i), merged, ...d.cards.slice(i + 2)] }
    })
  }, [])

  const addCards = (cards: Card[]) => {
    const total = deck.cards.length + cards.length
    setCards((existing) => [...existing, ...cards])
    setPage(Math.max(0, Math.ceil(total / PAGE_SIZE) - 1))
  }
    // ===== ترتيب الكروت زي File Explorer =====
  const CLIP_KEY = 'sammaa-card-clipboard'
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [dragIds, setDragIds] = useState<string[] | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [hasClip, setHasClip] = useState(false)
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    setHasClip(!!localStorage.getItem(CLIP_KEY))
  }, [])

  const pickCard = (id: string, e: React.MouseEvent) => {
    const ids = deck.cards.map((c) => c.id)
    if (e.shiftKey && anchorId) {
      const a = ids.indexOf(anchorId)
      const b = ids.indexOf(id)
      const [s, t] = a < b ? [a, b] : [b, a]
      setPicked(new Set(ids.slice(s, t + 1)))
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setPicked((p) => {
        const n = new Set(p)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })
      setAnchorId(id)
      return
    }
    setPicked(new Set([id]))
    setAnchorId(id)
  }

  const selectAll = () => setPicked(new Set(deck.cards.map((c) => c.id)))

  const copyPicked = (cut = false) => {
    const chosen = deck.cards.filter((c) => picked.has(c.id))
    if (!chosen.length) return
    localStorage.setItem(CLIP_KEY, JSON.stringify(chosen.map((c) => c.cloze)))
    setHasClip(true)
    if (cut) {
      setCards((cards) => cards.filter((c) => !picked.has(c.id)))
      setPicked(new Set())
    }
  }

  const paste = () => {
    let clozes: string[] = []
    try {
      clozes = JSON.parse(localStorage.getItem(CLIP_KEY) ?? '[]')
    } catch {}
    if (!clozes.length) return
    const stamp = Date.now().toString(36)
    const fresh = clozes.map((cloze, i) => ({ id: `p${stamp}${i}`, cloze }) as Card)
    setCards((cards) => {
      const last = cards.reduce((m, c, i) => (picked.has(c.id) ? i : m), -1)
      const at = last < 0 ? cards.length : last + 1
      return [...cards.slice(0, at), ...fresh, ...cards.slice(at)]
    })
    setPicked(new Set(fresh.map((c) => c.id)))
  }

  const openMenu = (id: string | null, e: React.MouseEvent) => {
    e.preventDefault()
    if (id && !picked.has(id)) {
      setPicked(new Set([id]))
      setAnchorId(id)
    }
    setMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return
      if (e.key === 'Escape') {
        setMenu(null)
        setPicked(new Set())
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'a') {
        e.preventDefault()
        selectAll()
      } else if (k === 'c') copyPicked()
      else if (k === 'x') copyPicked(true)
      else if (k === 'v') {
        e.preventDefault()
        paste()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  const startDrag = (id: string, e: React.DragEvent) => {
    const ids = picked.has(id) ? deck.cards.filter((c) => picked.has(c.id)).map((c) => c.id) : [id]
    if (!picked.has(id)) setPicked(new Set([id]))
    setDragIds(ids)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ids.join(','))
    document.body.dataset.dragging = 'true'
  }

  const overCard = (index: number, e: React.DragEvent) => {
    if (!dragIds) return
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDropAt(e.clientY < r.top + r.height / 2 ? index : index + 1)
    if (e.clientY < 80) window.scrollBy(0, -14)
    else if (e.clientY > window.innerHeight - 80) window.scrollBy(0, 14)
  }

  const endDrag = () => {
    setDragIds(null)
    setDropAt(null)
    delete document.body.dataset.dragging
  }

  const dropCards = (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIds && dropAt !== null) {
      const moving = new Set(dragIds)
      const target = dropAt
      setCards((cards) => {
        const moved = cards.filter((c) => moving.has(c.id))
        const rest = cards.filter((c) => !moving.has(c.id))
        const at = cards.slice(0, target).filter((c) => !moving.has(c.id)).length
        return [...rest.slice(0, at), ...moved, ...rest.slice(at)]
      })
    }
    endDrag()
  }

  const startBox = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-card-id]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setBox({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY })
    if (!(e.ctrlKey || e.metaKey)) setPicked(new Set())
  }

  const moveBox = (e: React.PointerEvent) => {
    if (!box) return
    const b = { ...box, x1: e.clientX, y1: e.clientY }
    setBox(b)
    const l = Math.min(b.x0, b.x1)
    const r = Math.max(b.x0, b.x1)
    const t = Math.min(b.y0, b.y1)
    const btm = Math.max(b.y0, b.y1)
    const hit = new Set<string>()
    listRef.current?.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
      const q = el.getBoundingClientRect()
      if (q.left < r && q.right > l && q.top < btm && q.bottom > t) hit.add(el.dataset.cardId!)
    })
    setPicked(hit)
  }

  const menuItems = [
    { label: 'Copy', icon: Copy, keys: 'Ctrl+C', run: () => copyPicked(), off: !picked.size },
    { label: 'Cut', icon: Scissors, keys: 'Ctrl+X', run: () => copyPicked(true), off: !picked.size },
    { label: 'Paste', icon: ClipboardPaste, keys: 'Ctrl+V', run: paste, off: !hasClip },
    { label: 'Select all', icon: ListChecks, keys: 'Ctrl+A', run: selectAll, off: !deck.cards.length },
  ]

  const applyTermsToAll = () => {
    const list = parseTerms(terms)
    setCards((cards) => cards.map((c) => ({ ...c, cloze: applyTerms(c.cloze, list) })))
  }

  const openExisting = async (id: string) => {
    if (!id) return
    if (deck.cards.length && !confirm('The cards currently in the editor will be replaced. Continue?')) return
    setLoadingDeck(true)
    try {
      const full = await loadDeck(id)
      if (!full) throw new Error('Deck not found.')
      setDeck(full)
      setSelectedGroupId(full.groupId)
      savedIds.current = { deckId: full.id, ids: full.cards.map((c) => c.id) }
      setPage(0)
      setSave({ status: 'idle' })
      setActive(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not load the deck.')
    } finally {
      setLoadingDeck(false)
    }
  }

  // Type a deck name: open it if it already exists, otherwise start a new deck with that name.
  const startFromName = async () => {
    const name = newName.trim()
    if (!name) return
    if (!selectedGroupId) {
      alert('Choose a group first.')
      return
    }
    const existing = existingDecks.find(
      (d) => d.groupId === selectedGroupId && d.title.trim().toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      await openExisting(existing.id)
      setNewName('')
      return
    }
    if (deck.cards.length && !confirm('The cards currently in the editor will be replaced. Continue?')) return
    const taken = new Set(existingDecks.map((d) => d.id))
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `deck-${Date.now().toString(36)}`
    let id = base
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    setDeck({ ...emptyDeck, id, groupId: selectedGroupId, title: name })
    savedIds.current = null
    setTerms('')
    setPage(0)
    setSave({ status: 'idle' })
    setNewName('')
    setActive(true)
  }

  const addGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newGroupName.trim()
    if (!name) return
    setCreatingGroup(true)
    setGroupError('')
    try {
      const group = await createDeckGroup(name)
      setGroups((current) => [...current, group].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedGroupId(group.id)
      setMoveTargetGroupId(group.id)
      setNewGroupName('')
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : 'Could not create the group.')
    } finally {
      setCreatingGroup(false)
    }
  }

  const moveSelectedDeck = async () => {
    const selectedDeck = existingDecks.find((item) => item.id === moveDeckId)
    if (!selectedDeck || !moveTargetGroupId || moveTargetGroupId === selectedDeck.groupId) return
    setMove({ status: 'moving' })
    try {
      await moveDeckToGroup(selectedDeck.id, moveTargetGroupId)
      if (deck.id.trim() === selectedDeck.id) {
        setDeck((current) => ({ ...current, groupId: moveTargetGroupId }))
        setSelectedGroupId(moveTargetGroupId)
      }
      setMove({ status: 'done' })
      router.refresh()
    } catch (e) {
      setMove({ status: 'error', message: e instanceof Error ? e.message : 'Could not move the deck.' })
    }
  }

  const saveToSite = async () => {
    const id = deck.id.trim()
    if (!/^[a-z0-9-]+$/.test(id)) {
      alert('Deck ID must use lowercase English letters, numbers, and dashes.')
      return
    }
    const total = deck.cards.length
    setSave({ status: 'saving', done: 0, total })
    try {
      await saveDeckMeta({
        id,
        groupId: deck.groupId,
        title: deck.title,
        subject: deck.subject,
        description: deck.description,
        isFree: deck.isFree,
      })
      for (let i = 0; i < total; i++) {
        await saveCard(id, deck.cards[i], i)
        setSave({ status: 'saving', done: i + 1, total })
      }
      const previous = savedIds.current?.deckId === id ? savedIds.current.ids : []
      const current = new Set(deck.cards.map((c) => c.id))
      await deleteCards(id, previous.filter((cid) => !current.has(cid)))
      savedIds.current = { deckId: id, ids: [...current] }
      await finishDeckSave()
      setSave({ status: 'done' })
      router.refresh()
    } catch (e) {
      setSave({ status: 'error', message: e instanceof Error ? e.message : 'Save failed.' })
    }
  }

  const exportDeck = () => {
    const id = deck.id.trim() || 'deck'
    const blob = new Blob([JSON.stringify({ ...deck, id }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importDeck = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Deck
      if (!Array.isArray(data.cards)) throw new Error()
      const groupId = groups.some((group) => group.id === data.groupId) ? data.groupId : selectedGroupId
      setDeck({ ...emptyDeck, ...data, groupId })
      setSelectedGroupId(groupId)
      savedIds.current = null
      setPage(0)
      setActive(true)
    } catch {
      alert('This file is not a valid deck file.')
    }
  }

  const clearAll = async () => {
    const savedDeckId = savedIds.current?.deckId
    const message = savedDeckId
      ? 'This will permanently delete the saved deck and all its cards. Continue?'
      : 'Clear all cards and deck details?'
    if (!confirm(message)) return
    setLoadingDeck(true)
    try {
      if (savedDeckId) {
        await deleteDeck(savedDeckId)
        router.refresh()
      }
      setDeck(emptyDeck)
      savedIds.current = null
      setPage(0)
      setActive(false)
      setSave({ status: 'idle' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not clear the deck.')
    } finally {
      setLoadingDeck(false)
    }
  }

  const meta = (key: 'id' | 'title' | 'subject' | 'description') => ({
    value: deck[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDeck((d) => ({ ...d, [key]: e.target.value })),
  })

  const saving = save.status === 'saving'

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Choose a group
            <select
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value={selectedGroupId}
              disabled={loadingDeck || saving}
              onChange={(e) => {
                setSelectedGroupId(e.target.value)
                setMove({ status: 'idle' })
              }}
            >
              <option value="">Choose a group…</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Then choose a deck to edit
            <select
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value=""
              disabled={!selectedGroupId || loadingDeck || saving}
              onChange={(e) => openExisting(e.target.value)}
            >
              <option value="">{loadingDeck ? 'Loading…' : 'Choose a deck…'}</option>
              {existingDecks.filter((d) => d.groupId === selectedGroupId).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({d.cardCount} cards{d.isFree ? '' : ' · paid'})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Move any saved deck
            <select
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value={moveDeckId}
              disabled={loadingDeck || saving || move.status === 'moving'}
              onChange={(e) => {
                setMoveDeckId(e.target.value)
                setMove({ status: 'idle' })
              }}
            >
              <option value="">Choose a deck…</option>
              {existingDecks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {item.groupName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Destination group
            <select
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value={moveTargetGroupId}
              disabled={loadingDeck || saving || move.status === 'moving'}
              onChange={(e) => {
                setMoveTargetGroupId(e.target.value)
                setMove({ status: 'idle' })
              }}
            >
              <option value="">Choose a group…</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={moveSelectedDeck}
            disabled={
              !moveDeckId ||
              !moveTargetGroupId ||
              existingDecks.find((item) => item.id === moveDeckId)?.groupId === moveTargetGroupId ||
              move.status === 'moving' ||
              saving
            }
          >
            <ArrowRightLeft aria-hidden />
            {move.status === 'moving' ? 'Moving…' : 'Move deck'}
          </Button>
          {move.status === 'done' && <span role="status" className="text-xs text-success sm:col-span-3">Deck moved successfully.</span>}
          {move.status === 'error' && <span role="alert" className="text-xs text-destructive sm:col-span-3">{move.message}</span>}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            startFromName()
          }}
        >
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Or type a deck name in the selected group
            <input
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value={newName}
              disabled={!selectedGroupId || loadingDeck || saving}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New deck name"
            />
          </label>
          <Button type="submit" size="sm" disabled={!selectedGroupId || !newName.trim() || loadingDeck || saving}>
            Open / Create
          </Button>
        </form>
        <form className="flex flex-wrap items-end gap-2 border-t pt-3" onSubmit={addGroup}>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Create a group
            <input
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value={newGroupName}
              disabled={creatingGroup}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. Cardiovascular system"
            />
          </label>
          <Button type="submit" size="sm" disabled={!newGroupName.trim() || creatingGroup}>
            {creatingGroup ? 'Creating…' : 'Create group'}
          </Button>
          {groupError && <p role="alert" className="w-full text-xs text-destructive">{groupError}</p>}
        </form>
      </section>

      {active && (
        <>
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Deck title" {...meta('title')} placeholder="Guyton – Heart" />
        <Field label="Subject" {...meta('subject')} placeholder="Physiology" />
        <Field label="ID (used in the URL)" {...meta('id')} placeholder="guyton-heart" dir="ltr" />
        <Field label="Short description" {...meta('description')} placeholder="Chapters 9 to 12" />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Access
          <select
            className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            value={deck.isFree ? 'free' : 'paid'}
            onChange={(e) => setDeck((d) => ({ ...d, isFree: e.target.value === 'free' }))}
          >
            <option value="free">Free</option>
            <option value="paid">Paid (needs a code)</option>
          </select>
        </label>
      </section>

      <SourcePanel terms={terms} onTermsChange={setTerms} onGenerate={addCards} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">3. Review the cards</h2>
            <p className="text-xs text-muted-foreground">
              {deck.cards.length} cards · {stats.blanks} blanks
              {stats.empty > 0 && <span className="text-destructive"> · {stats.empty} without blanks</span>}
              {' · '}Click any word to blank or unblank it
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={applyTermsToAll} disabled={!deck.cards.length}>
              <ListChecks aria-hidden /> Apply list to all cards
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden /> Open file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importDeck(file)
                e.target.value = ''
              }}
            />
            <Button variant="outline" size="sm" onClick={exportDeck} disabled={!deck.cards.length}>
              <Download aria-hidden /> Download deck
            </Button>
            <Button size="sm" onClick={saveToSite} disabled={!deck.cards.length || saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <CloudUpload aria-hidden />} Save to site
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAll} disabled={saving || loadingDeck}>
              <Eraser aria-hidden /> Clear
            </Button>
          </div>
        </div>

        <p className="text-xs" role="status" aria-live="polite">
          {save.status === 'saving' && (
            <span className="text-muted-foreground">
              Saving card {save.done} of {save.total}…
            </span>
          )}
          {save.status === 'done' && <span className="text-primary">Deck saved to the site.</span>}
          {save.status === 'error' && <span className="text-destructive">Save failed: {save.message}</span>}
        </p>

        {deck.cards.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No cards yet. Paste text above and generate cards.
          </p>
        ) : (
                    <>
            {picked.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
                <span className="font-semibold">{picked.size} محدد</span>
                <Button variant="ghost" size="xs" onClick={() => copyPicked()}>
                  <Copy aria-hidden /> Copy
                </Button>
                <Button variant="ghost" size="xs" onClick={() => copyPicked(true)}>
                  <Scissors aria-hidden /> Cut
                </Button>
                <Button variant="ghost" size="xs" disabled={!hasClip} onClick={paste}>
                  <ClipboardPaste aria-hidden /> Paste
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setPicked(new Set())}>
                  إلغاء التحديد
                </Button>
              </div>
            )}
            <div
              className="-m-3 p-3"
              onPointerDown={startBox}
              onPointerMove={moveBox}
              onPointerUp={() => setBox(null)}
              onPointerCancel={() => setBox(null)}
              onLostPointerCapture={() => setBox(null)}
              onContextMenu={(e) => {
                if ((e.target as HTMLElement).closest('[data-card-id]')) return
                openMenu(null, e)
              }}
            >
              <ol
                ref={listRef}
                className="flex flex-col gap-3"
                onDragOver={(e) => {
                  if (dragIds) e.preventDefault()
                }}
                onDrop={dropCards}
              >
                {visible.map((card, i) => {
                  const absolute = page * PAGE_SIZE + i
                  const lastOnPage = i === visible.length - 1
                  return (
                    <CardEditor
                      key={card.id}
                      card={card}
                      number={absolute + 1}
                      index={absolute}
                      selected={picked.has(card.id)}
                      dragging={!!dragIds?.includes(card.id)}
                      dropLine={
                        dropAt === absolute ? 'before' : lastOnPage && dropAt === absolute + 1 ? 'after' : null
                      }
                      onChange={changeCard}
                      onDelete={deleteCard}
                      onMergeNext={absolute < deck.cards.length - 1 ? mergeNext : undefined}
                      onPick={pickCard}
                      onMenu={openMenu}
                      onDragStart={startDrag}
                      onDragOverCard={overCard}
                      onDragEnd={endDrag}
                    />
                  )
                })}
              </ol>
            </div>

            {menu && (
              <div
                role="menu"
                className="fixed z-[90] min-w-48 overflow-hidden rounded-xl border bg-popover p-1 text-sm text-popover-foreground shadow-xl"
                style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 190) }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {menuItems.map(({ label, icon: Icon, keys, run, off }) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    disabled={off}
                    onClick={() => {
                      run()
                      setMenu(null)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Icon className="size-4" aria-hidden />
                    <span className="flex-1">{label}</span>
                    <span className="text-xs text-muted-foreground">{keys}</span>
                  </button>
                ))}
              </div>
            )}

            {box && (
              <div
                aria-hidden
                className="pointer-events-none fixed z-[80] rounded-md border border-primary bg-primary/10"
                style={{
                  left: Math.min(box.x0, box.x1),
                  top: Math.min(box.y0, box.y1),
                  width: Math.abs(box.x1 - box.x0),
                  height: Math.abs(box.y1 - box.y0),
                }}
              />
            )}
          </>
        )}

        {pageCount > 1 && (
          <nav className="flex items-center justify-center gap-2" aria-label="Card pages">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </nav>
        )}
      </section>
        </>
      )}
    </div>
  )
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        {...props}
        className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  )
}
