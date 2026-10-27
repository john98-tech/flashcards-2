'use client'

import { useState } from 'react'
import { BookOpen, KeyRound, Layers, PenLine, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RecallCourse, RecallLesson, RecallSettings } from '@/lib/active-recall/types'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { DeckEditor } from './deck-editor'
import { AiDeckOrganizer } from './ai-deck-organizer'
import { CodesPanel } from './codes-panel'
import { DictationAdmin, type DictationAdminData } from './dictation-admin'
import { ActiveRecallAdmin } from './active-recall-admin'

type Section = 'flashcards' | 'dictation' | 'active-recall'
type Tab = 'decks' | 'codes' | 'ai-organizer'

const noDictation: DictationAdminData = { subjects: [], lessons: [], loadError: null }
const noActiveRecall = { courses: [], lessons: [], settings: null, loadError: null } satisfies {
  courses: RecallCourse[]
  lessons: RecallLesson[]
  settings: RecallSettings | null
  loadError: null
}

export function AdminTabs({
  decks,
  groups,
  dictation = noDictation,
  activeRecall = noActiveRecall,
}: {
  decks: DeckSummary[]
  groups: DeckGroup[]
  dictation?: DictationAdminData
  activeRecall?: { courses: RecallCourse[]; lessons: RecallLesson[]; settings: RecallSettings | null; loadError: string | null }
}) {
  const [section, setSection] = useState<Section>('flashcards')

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Admin areas" className="flex w-full gap-1 overflow-x-auto rounded-xl border bg-card p-1 sm:w-fit">
        <SectionButton active={section === 'flashcards'} onClick={() => setSection('flashcards')}>
          <Layers className="size-4" aria-hidden /> الفلاش كاردس
        </SectionButton>
        <SectionButton active={section === 'dictation'} onClick={() => setSection('dictation')}>
          <PenLine className="size-4" aria-hidden /> التسميع بالكتابة
        </SectionButton>
        <SectionButton active={section === 'active-recall'} onClick={() => setSection('active-recall')}>
          <BookOpen className="size-4" aria-hidden /> المراجعة اليومية
        </SectionButton>
      </div>
      <div hidden={section !== 'flashcards'}>
        <FlashcardsSection decks={decks} groups={groups} />
      </div>
      <div hidden={section !== 'dictation'}>
        <DictationAdmin {...dictation} />
      </div>
      <div hidden={section !== 'active-recall'}>
        <ActiveRecallAdmin {...activeRecall} />
      </div>
    </div>
  )
}

// The flashcards admin: Decks / Access codes / AI organization.
function FlashcardsSection({ decks, groups }: { decks: DeckSummary[]; groups: DeckGroup[] }) {
  const [tab, setTab] = useState<Tab>('decks')

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
      </div>
      <div hidden={tab !== 'decks'}>
        <DeckEditor existingDecks={decks} existingGroups={groups} />
      </div>
      <div hidden={tab !== 'codes'}>
        <CodesPanel decks={decks} />
      </div>
      <div hidden={tab !== 'ai-organizer'}>
        <AiDeckOrganizer decks={decks} groups={groups} />
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
        'flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4',
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
