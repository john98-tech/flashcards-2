'use client'

import { useState } from 'react'
import { KeyRound, Layers, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { DeckEditor } from './deck-editor'
import { CodesPanel } from './codes-panel'
import { DictationAdmin, type DictationAdminData } from './dictation-admin'

type Section = 'flashcards' | 'dictation'
type Tab = 'decks' | 'codes'

const noDictation: DictationAdminData = { subjects: [], lessons: [], loadError: null }

export function AdminTabs({
  decks,
  groups,
  dictation = noDictation,
}: {
  decks: DeckSummary[]
  groups: DeckGroup[]
  dictation?: DictationAdminData
}) {
  const [section, setSection] = useState<Section>('flashcards')

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Admin areas" className="grid w-full grid-cols-2 gap-1 rounded-xl border bg-card p-1 sm:w-fit sm:min-w-96">
        <SectionButton active={section === 'flashcards'} onClick={() => setSection('flashcards')}>
          <Layers className="size-4" aria-hidden /> الفلاش كاردس
        </SectionButton>
        <SectionButton active={section === 'dictation'} onClick={() => setSection('dictation')}>
          <PenLine className="size-4" aria-hidden /> التسميع بالكتابة
        </SectionButton>
      </div>
      <div hidden={section !== 'flashcards'}>
        <FlashcardsSection decks={decks} groups={groups} />
      </div>
      <div hidden={section !== 'dictation'}>
        <DictationAdmin {...dictation} />
      </div>
    </div>
  )
}

// The flashcards admin: Decks / Access codes.
function FlashcardsSection({ decks, groups }: { decks: DeckSummary[]; groups: DeckGroup[] }) {
  const [tab, setTab] = useState<Tab>('decks')

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Admin sections" className="flex w-fit gap-1 rounded-lg border bg-card p-1">
        <TabButton active={tab === 'decks'} onClick={() => setTab('decks')}>
          <Layers className="size-4" aria-hidden /> Decks
        </TabButton>
        <TabButton active={tab === 'codes'} onClick={() => setTab('codes')} data-tour="admin-codes-tab" data-tour-action="open-admin-codes">
          <KeyRound className="size-4" aria-hidden /> Access codes
        </TabButton>
      </div>
      <div hidden={tab !== 'decks'}>
        <DeckEditor existingDecks={decks} existingGroups={groups} />
      </div>
      <div hidden={tab !== 'codes'}>
        <CodesPanel decks={decks} />
      </div>
    </div>
  )
}

function SectionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
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
