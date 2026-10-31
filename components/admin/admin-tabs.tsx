'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Layers, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { DeckEditor } from './deck-editor'
import { AiDeckOrganizer } from './ai-deck-organizer'
import { CodesPanel } from './codes-panel'
import { RecycleBinPanel } from './recycle-bin-panel'

type Tab = 'decks' | 'codes' | 'ai-organizer' | 'recycle-bin'

export function AdminTabs({ decks, groups }: { decks: DeckSummary[]; groups: DeckGroup[] }) {
  const [tab, setTab] = useState<Tab>('decks')
  const [tabRestored, setTabRestored] = useState(false)

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem('admin-flashcards-tab')
      if (saved === 'decks' || saved === 'codes' || saved === 'ai-organizer' || saved === 'recycle-bin') {
        setTab(saved)
      }
    } catch {
      // Storage may be unavailable; the tabs still work for this render.
    }
    setTabRestored(true)
  }, [])

  useEffect(() => {
    if (!tabRestored) return
    try {
      window.sessionStorage.setItem('admin-flashcards-tab', tab)
    } catch {
      // Ignore unavailable session storage.
    }
  }, [tab, tabRestored])

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Flashcards admin sections" className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border bg-card p-1">
        <TabButton active={tab === 'decks'} onClick={() => setTab('decks')}>
          <Layers className="size-4" aria-hidden /> Decks
        </TabButton>
        <TabButton active={tab === 'codes'} onClick={() => setTab('codes')} data-tour="admin-codes-tab" data-tour-action="open-admin-codes">
          <KeyRound className="size-4" aria-hidden /> Access codes
        </TabButton>
        <TabButton active={tab === 'ai-organizer'} onClick={() => setTab('ai-organizer')}>
          <Sparkles className="size-4" aria-hidden /> تنظيم بالذكاء الاصطناعي
        </TabButton>
        <TabButton active={tab === 'recycle-bin'} onClick={() => setTab('recycle-bin')}>
          <Trash2 className="size-4" aria-hidden /> سلة المحذوفات
        </TabButton>
      </div>
      <div hidden={tab !== 'decks'}><DeckEditor existingDecks={decks} existingGroups={groups} /></div>
      <div hidden={tab !== 'codes'}><CodesPanel decks={decks} /></div>
      <div hidden={tab !== 'ai-organizer'}><AiDeckOrganizer decks={decks} groups={groups} /></div>
      <div hidden={tab !== 'recycle-bin'}><RecycleBinPanel /></div>
    </div>
  )
}

function TabButton({ active, onClick, children, ...attrs }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  'data-tour'?: string
  'data-tour-action'?: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      {...attrs}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
