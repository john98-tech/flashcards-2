'use client'

import { useState } from 'react'
import { BookOpenText, KeyRound, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { DeckEditor } from './deck-editor'
import { CodesPanel } from './codes-panel'
import { RecitationEditor } from './recitation-editor'

type Tab = 'decks' | 'recitation' | 'codes'

export function AdminTabs({ decks, groups }: { decks: DeckSummary[]; groups: DeckGroup[] }) {
  const [tab, setTab] = useState<Tab>('decks')

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Admin sections" className="flex w-fit gap-1 rounded-lg border bg-card p-1">
        <TabButton active={tab === 'decks'} onClick={() => setTab('decks')}>
          <Layers className="size-4" aria-hidden /> Decks
        </TabButton>
        <TabButton active={tab === 'recitation'} onClick={() => setTab('recitation')}>
          <BookOpenText className="size-4" aria-hidden /> التسميع بالكتابة
        </TabButton>
        <TabButton active={tab === 'codes'} onClick={() => setTab('codes')} data-tour="admin-codes-tab" data-tour-action="open-admin-codes">
          <KeyRound className="size-4" aria-hidden /> Access codes
        </TabButton>
      </div>
      <div hidden={tab !== 'decks'}>
        <DeckEditor existingDecks={decks} existingGroups={groups} />
      </div>
      <div hidden={tab !== 'recitation'}>
        <RecitationEditor decks={decks} />
      </div>
      <div hidden={tab !== 'codes'}>
        <CodesPanel decks={decks} />
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children, ...attrs }: { active: boolean; onClick: () => void; children: React.ReactNode; 'data-tour'?: string; 'data-tour-action'?: string }) {
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
