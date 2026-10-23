import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getDeck, getDeckMeta, getReciteSource } from '@/lib/decks'
import { canOpen, getAccess } from '@/lib/access'
import { deckToReferenceText } from '@/lib/recite'
import { ReciteWorkspace } from '@/components/recite/recite-workspace'

export async function generateMetadata({ params }: PageProps<'/recite/[id]'>): Promise<Metadata> {
  const deck = await getDeckMeta((await params).id)
  return { title: deck ? `${deck.title} | Recite` : 'Recite' }
}

export default async function ReciteLessonPage({ params }: PageProps<'/recite/[id]'>) {
  const { id } = await params
  const [meta, access] = await Promise.all([getDeckMeta(id), getAccess()])
  if (!meta) notFound()
  if (!canOpen(meta, access)) redirect(`/decks/${id}`)
  const [deck, savedReference] = await Promise.all([getDeck(id), getReciteSource(id)])
  if (!deck) notFound()

  return (
    <ReciteWorkspace
      lesson={{ id: deck.id, title: deck.title, subject: deck.subject }}
      reference={savedReference.trim() || deckToReferenceText(deck.cards)}
    />
  )
}
