import { countBlanks, type Deck } from './cloze'

/**
 * Static content of the tutorial's demo deck (safe to import from server and
 * client code). Nothing here is stored in the database.
 */

export const DEMO_GROUP_ID = 'demo-tour-group'
export const DEMO_DECK_ID = 'demo-tour-deck'
export const DEMO_CODE = 'TRYA-2026-DEMO'

export const demoGroup = { id: DEMO_GROUP_ID, name: 'Cardiovascular Physiology' }

export const demoDeck: Deck = {
  id: DEMO_DECK_ID,
  groupId: DEMO_GROUP_ID,
  title: 'Cardiac Conduction System',
  subject: 'Physiology',
  description: 'The pacemaker tissue of the heart and the path of the cardiac impulse.',
  isFree: false,
  cards: [
    {
      id: 'demo-1',
      cloze:
        'The {{sinoatrial (SA) node}} is the normal pacemaker of the heart and fires at about {{60 to 100}} beats per minute at rest.',
    },
    {
      id: 'demo-2',
      cloze:
        'The {{atrioventricular (AV) node}} delays the impulse by about {{0.1 seconds}}, which lets the {{atria}} finish contracting before the {{ventricles}} begin.',
    },
  ],
}

export const demoDeckSummary = {
  id: demoDeck.id,
  groupId: demoDeck.groupId,
  title: demoDeck.title,
  subject: demoDeck.subject,
  description: demoDeck.description,
  isFree: demoDeck.isFree,
  groupName: demoGroup.name,
  cardCount: demoDeck.cards.length,
  blankCount: demoDeck.cards.reduce((sum, card) => sum + countBlanks(card.cloze), 0),
}

export const normalizeDemoCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const isDemoCode = (raw: string) => normalizeDemoCode(raw) === normalizeDemoCode(DEMO_CODE)
