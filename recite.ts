import { plainText } from './cloze'

/** Plain-text version of a lesson (cloze markers removed) used as the grading reference. */
export function deckToReferenceText(cards: { cloze: string }[]) {
  return cards
    .map((card) => plainText(card.cloze).trim())
    .filter(Boolean)
    .join('\n')
}
