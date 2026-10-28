'use client'

import { useMemo, useRef, useState } from 'react'
import { Bot, Loader2, MessageCircle, Sparkles, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiKeyDialog } from '@/components/gemini/api-key-dialog'
import { GeminiError, generate, useGeminiConfig } from '@/lib/gemini'
import type { Deck, Card } from '@/lib/cloze'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { createDeckGroup, deleteCards, deleteDeck, deleteDeckGroup, finishDeckSave, listRecycleBin, loadDeck, moveDeckToGroup, restoreRecycleBinItem, saveCard, saveDeckMeta } from '@/app/admin/actions'

type PlanDeck = { title: string; subject?: string; description?: string; groupName: string; cardIndexes: number[] }
type Plan = { groups: string[]; decks: PlanDeck[]; explanation?: string }
type Message = { role: 'user' | 'assistant'; text: string }

const SYSTEM = `أنت وكيل إدارة فعلي داخل لوحة أدمن فلاش كاردس. تتلقى بيانات المجموعات والدروس والكروت وسلة المحذوفات. أرجع JSON صالحًا فقط دائمًا. لتنظيم بطاقات المجموعة استخدم الشكل { "groups": [], "decks": [{ "title":"", "subject":"", "description":"", "groupName":"", "cardIndexes":[] }], "explanation":"" } ووزع كل بطاقة مرة واحدة دون تغيير نصها. لأي طلب إدارة آخر استخدم الشكل { "actions": [{"type":"..."}], "explanation":"..." }. أنواع الإجراءات المسموحة: create_group {type,name}; create_deck {type,title,subject,description,groupName,isFree}; rename_deck {type,deckId,title,subject,description,isFree}; move_deck {type,deckId,groupName}; delete_deck {type,deckId}; delete_group {type,groupName}; delete_cards {type,deckId,cardIds}; edit_card {type,deckId,cardId,cloze}; restore_deleted {type,recycleBinId}. استخدم IDs الموجودة حرفيًا من السياق. في إنشاء مجموعة أو درس لا تخترع IDs؛ التطبيق ينشئها. عند تعديل أو حذف كروت استخدم IDs الموجودة فقط. احذف الدروس أو المجموعات أو الكروت فقط إذا طلب المستخدم ذلك صراحة. إذا لم تكن البيانات كافية لتنفيذ الطلب، أرجع actions فارغة واشرح ما ينقص. أجب بالعربية. لا تدّع تنفيذ شيء؛ التطبيق هو الذي ينفذ الإجراءات بعد موافقة المستخدم.`

// Groq gets its own prompt because its JSON mode differs from Gemini's structured-output mode.
const GROQ_SYSTEM = "أنت وكيل إدارة فعلي داخل لوحة أدمن فلاش كاردس. تتلقى بيانات المجموعات والدروس والكروت وسلة المحذوفات. أرجع JSON صالحًا فقط دائمًا. لتنظيم بطاقات المجموعة استخدم الشكل { \"groups\": [], \"decks\": [{ \"title\":\"\", \"subject\":\"\", \"description\":\"\", \"groupName\":\"\", \"cardIndexes\":[] }], \"explanation\":\"\" } ووزع كل بطاقة مرة واحدة دون تغيير نصها. لأي طلب إدارة آخر استخدم الشكل { \"actions\": [{\"type\":\"...\"}], \"explanation\":\"...\" }. أنواع الإجراءات المسموحة: create_group {type,name}; create_deck {type,title,subject,description,groupName,isFree}; rename_deck {type,deckId,title,subject,description,isFree}; move_deck {type,deckId,groupName}; delete_deck {type,deckId}; delete_group {type,groupName}; delete_cards {type,deckId,cardIds}; edit_card {type,deckId,cardId,cloze}; restore_deleted {type,recycleBinId}. استخدم IDs الموجودة حرفيًا من السياق. في إنشاء مجموعة أو درس لا تخترع IDs؛ التطبيق ينشئها. عند تعديل أو حذف كروت استخدم IDs الموجودة فقط. احذف الدروس أو المجموعات أو الكروت فقط إذا طلب المستخدم ذلك صراحة. إذا لم تكن البيانات كافية لتنفيذ الطلب، أرجع actions فارغة واشرح ما ينقص. أجب بالعربية. لا تدّع تنفيذ شيء؛ التطبيق هو الذي ينفذ الإجراءات بعد موافقة المستخدم.\\n\\nمهم لمزوّد Groq: أرجع كائن JSON واحدًا فقط دون Markdown أو سياج كود أو أي نص خارجه. لا تستخدم null بدل القيم المطلوبة، والتزم بمفاتيح الشكل المطلوب. إذا كان الطلب تنظيم بطاقات فاستخدم groups وdecks، وإذا كان طلب إدارة فاستخدم actions وexplanation."

function parsePlan(text: string): Plan {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.decks)) throw new Error('Gemini رجّع خطة غير مكتملة. جرّب مرة أخرى.')
  return parsed as Plan
}

export function AiDeckOrganizer({ decks, groups }: { decks: DeckSummary[]; groups: DeckGroup[] }) {
  const { config } = useGeminiConfig()
  const [sourceGroupId, setSourceGroupId] = useState(groups[0]?.id ?? '')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [sourceCards, setSourceCards] = useState<Card[]>([])
  const [sourceDeckIds, setSourceDeckIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [notice, setNotice] = useState('')
  const groupName = useMemo(() => groups.find(g => g.id === sourceGroupId)?.name ?? '', [groups, sourceGroupId])
  const sourceDecks = useMemo(() => decks.filter(d => d.groupId === sourceGroupId), [decks, sourceGroupId])

  const getCards = async () => {
    const loaded = await Promise.all(sourceDecks.map(d => loadDeck(d.id)))
    const valid = loaded.filter((d): d is Deck => !!d)
    const cards = valid.flatMap(d => d.cards.map(c => ({ ...c, __sourceDeck: d.id } as Card & { __sourceDeck: string })))
    setSourceCards(cards)
    setSourceDeckIds(valid.map(d => d.id))
    return { valid, cards }
  }

  const makePlan = async () => {
    if (!config) { setShowKey(true); return }
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true); setError(''); setNotice('')
    try {
      const { cards } = await getCards()
      if (!cards.length) throw new Error('المجموعة دي مفيهاش كروت.')
      // Keep each request below Groq's on-demand TPM request-size ceiling.
      const batches: Array<Array<{ index: number; text: string }>> = []
      let batch: Array<{ index: number; text: string }> = []
      let chars = 0
      cards.forEach((card, index) => {
        const text = String(card.cloze ?? '')
        if (text.length > 6000) throw new Error(`البطاقة رقم ${index + 1} طويلة جدًا لطلب واحد. قصّر نصها ثم أعد المحاولة.`)
        if (batch.length && (batch.length >= 8 || chars + text.length > 6000)) {
          batches.push(batch)
          batch = []
          chars = 0
        }
        batch.push({ index, text })
        chars += text.length
      })
      if (batch.length) batches.push(batch)
      const merged: Plan = { groups: [], decks: [], explanation: '' }
      const groupNames = new Set<string>()
      const deckMap = new Map<string, PlanDeck>()
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        setNotice(`جاري تنظيم الدفعة ${batchIndex + 1} من ${batches.length}...`)
        const current = batches[batchIndex]
        const prompt = `نظّم الدفعة الحالية من بطاقات مجموعة "${groupName}" إلى مجموعات ودروس مناسبة. أرجع JSON حسب النظام، ووزّع كل index محلي مرة واحدة بالضبط. لا تغيّر النصوص. البطاقات: ${JSON.stringify(current.map((c, i) => ({ index: i, text: c.text })))}`
        const response = await generate(config, prompt, { system: config.provider === 'groq' ? GROQ_SYSTEM : SYSTEM, json: true, temperature: 0.1, signal: controller.signal })
        const part = parsePlan(response)
        const used = part.decks.flatMap(deck => deck.cardIndexes)
        if (used.some(i => !Number.isInteger(i) || i < 0 || i >= current.length) || new Set(used).size !== used.length || used.length !== current.length) {
          throw new Error(`الدفعة ${batchIndex + 1}: لم يتم توزيع كل البطاقات مرة واحدة بالضبط. لم يتم تطبيق أي تغيير؛ أعد المحاولة.`)
        }
        for (const name of part.groups) {
          const key = String(name).trim().toLowerCase()
          if (key && !groupNames.has(key)) { groupNames.add(key); merged.groups.push(String(name).trim()) }
        }
        for (const deck of part.decks) {
          const key = `${String(deck.groupName || '').trim().toLowerCase()}::${String(deck.title || '').trim().toLowerCase()}`
          const indexes = deck.cardIndexes.map(i => current[i].index)
          const existing = deckMap.get(key)
          if (existing) existing.cardIndexes.push(...indexes)
          else deckMap.set(key, { ...deck, cardIndexes: indexes })
        }
      }
      merged.decks = Array.from(deckMap.values())
      merged.explanation = `تم تنظيم ${cards.length} بطاقة على ${batches.length} دفعات لتفادي حد حجم طلب Groq.`
      const next = merged
      const used = next.decks.flatMap(d => d.cardIndexes)
      if (used.some(i => !Number.isInteger(i) || i < 0 || i >= cards.length)) throw new Error('الخطة فيها أرقام بطاقات غير صحيحة.')
      if (new Set(used).size !== used.length) throw new Error('الخطة كررت بعض البطاقات. أعد المحاولة.')
      if (used.length !== cards.length) throw new Error(`تم توزيع ${used.length} من أصل ${cards.length} بطاقة فقط. لم يتم تطبيق أي تغيير؛ أعد المحاولة.`)
      setPlan(next)
      setMessages([{ role: 'assistant', text: next.explanation || `اقترحت ${next.groups.length} مجموعات و${next.decks.length} دروس. راجع الخطة قبل التطبيق.` }])
    } catch (e) { setError(e instanceof Error ? e.message : 'حصل خطأ أثناء التنظيم.') }
    finally { if (abortRef.current === controller) abortRef.current = null; setBusy(false) }
  }

  const sendChat = async () => {
    const prompt = chatInput.trim()
    if (!prompt) return
    if (!config) { setShowKey(true); return }
    const history = [...messages, { role: 'user' as const, text: prompt }]
    setMessages(history); setChatInput(''); setBusy(true); setError(''); setNotice('')
    try {
      // Load cards directly from persistent storage for every deck before asking Gemini.
      // The chat must never depend on cards having been opened manually in the UI.
      const cardsByDeck = await Promise.all(decks.map(async deck => {
        const loaded = await loadDeck(deck.id)
        return (loaded?.cards ?? []).map(card => ({ ...card, __sourceDeck: deck.id }))
      }))
      const availableCards = cardsByDeck.flat()
      const recycleBin = await listRecycleBin()
      const catalog = {
        groups: groups.map(g => ({ id: g.id, name: g.name })),
        decks: decks.map(d => ({ id: d.id, title: d.title, subject: d.subject, description: d.description, groupId: d.groupId, groupName: groups.find(g => g.id === d.groupId)?.name ?? '', isFree: d.isFree, cardCount: d.cardCount })),
        recycleBin: recycleBin.map(item => ({ id: item.id, entityType: item.entityType, entityId: item.entityId, deletedAt: item.deletedAt })),
        selectedGroup: { id: sourceGroupId, name: groupName },
        currentPlan: plan,
        loadedCards: availableCards.map((card, index) => ({ index, id: card.id, text: card.cloze, deckId: card.__sourceDeck }))
      }
      const request = 'بيانات الإدارة الحالية بصيغة JSON: ' + JSON.stringify(catalog) + '\nسجل المحادثة السابقة: ' + JSON.stringify(history.slice(-12)) + '\nطلب المستخدم الحالي: ' + prompt + '\nأرجع JSON فقط حسب تعليمات النظام. إذا كان طلب إدارة فأنشئ actions دقيقة قابلة للتنفيذ.'
      const response = await generate(config, request, { system: config.provider === 'groq' ? GROQ_SYSTEM : SYSTEM, json: true, temperature: 0.1, signal: controller.signal })
      const cleaned = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned) as { actions?: Array<Record<string, unknown>>; explanation?: string; groups?: string[]; decks?: PlanDeck[] }
      if (Array.isArray(parsed.actions)) {
        const actions = parsed.actions
        if (!actions.length) {
          setMessages([...history, { role: 'assistant', text: parsed.explanation || 'مفيش تغييرات مطلوبة.' }])
          return
        }
        const labels: Record<string, string> = { create_group: 'إنشاء مجموعة', create_deck: 'إنشاء درس', rename_deck: 'تعديل بيانات درس', move_deck: 'نقل درس', delete_deck: 'حذف درس', delete_group: 'حذف مجموعة', delete_cards: 'حذف كروت', edit_card: 'تعديل كارت', restore_deleted: 'استعادة عنصر محذوف' }
        const summary = actions.map((a, i) => (i + 1) + '. ' + (labels[String(a.type)] || String(a.type))).join('\n')
        if (!confirm('Gemini اقترح الإجراءات التالية:\n' + summary + '\n\n' + (parsed.explanation || '') + '\n\nهل تريد تنفيذها؟ الحذف يذهب إلى سلة المحذوفات حيث تدعم العملية ذلك.')) {
          setMessages([...history, { role: 'assistant', text: 'تمام، لم أنفّذ أي تغيير لأنك ألغيت التأكيد.' }])
          return
        }
        setApplying(true)
        const knownDecks = new Map(decks.map(d => [d.id, d]))
        const knownGroups = new Map(groups.map(g => [g.name.toLowerCase(), g]))
        let completed = 0
        try {
          for (const action of actions) {
            const type = String(action.type || '')
            if (type === 'create_group') {
              const name = String(action.name || '').trim()
              if (!name) throw new Error('اسم المجموعة الجديدة ناقص.')
              if (!knownGroups.has(name.toLowerCase())) { const created = await createDeckGroup(name); knownGroups.set(created.name.toLowerCase(), created) }
            } else if (type === 'create_deck') {
              const title = String(action.title || '').trim()
              if (!title) throw new Error('اسم الدرس الجديد ناقص.')
              const groupNameForDeck = String(action.groupName || groupName || '').trim()
              let group = knownGroups.get(groupNameForDeck.toLowerCase())
              if (!group && groupNameForDeck) { group = await createDeckGroup(groupNameForDeck); knownGroups.set(group.name.toLowerCase(), group) }
              if (!group) throw new Error('حدد مجموعة للدرس الجديد.')
              const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lesson'
              let id = base; let suffix = 2
              while (knownDecks.has(id)) { id = base + '-ai-' + suffix; suffix++ }
              const meta = { id, groupId: group.id, title, subject: String(action.subject || groupNameForDeck).slice(0, 100), description: String(action.description || '').slice(0, 500), isFree: Boolean(action.isFree) }
              await saveDeckMeta(meta); knownDecks.set(id, { ...meta, cardCount: 0 } as DeckSummary)
            } else if (type === 'rename_deck') {
              const id = String(action.deckId || ''); const deck = knownDecks.get(id)
              if (!deck) throw new Error('الدرس المطلوب تعديله غير موجود: ' + id)
              await saveDeckMeta({ id, groupId: deck.groupId, title: String(action.title || deck.title).slice(0, 200), subject: String(action.subject ?? deck.subject ?? '').slice(0, 100), description: String(action.description ?? deck.description ?? '').slice(0, 500), isFree: action.isFree === undefined ? Boolean(deck.isFree) : Boolean(action.isFree) })
            } else if (type === 'move_deck') {
              const id = String(action.deckId || ''); const deck = knownDecks.get(id)
              if (!deck) throw new Error('الدرس المطلوب نقله غير موجود: ' + id)
              const targetName = String(action.groupName || '').trim(); const target = knownGroups.get(targetName.toLowerCase())
              if (!target) throw new Error('المجموعة المستهدفة غير موجودة: ' + targetName)
              await moveDeckToGroup(id, target.id); knownDecks.set(id, { ...deck, groupId: target.id })
            } else if (type === 'delete_deck') {
              const id = String(action.deckId || '')
              if (!knownDecks.has(id)) throw new Error('الدرس المطلوب حذفه غير موجود: ' + id)
              await deleteDeck(id); knownDecks.delete(id)
            } else if (type === 'delete_group') {
              const name = String(action.groupName || '').trim(); const group = knownGroups.get(name.toLowerCase())
              if (!group) throw new Error('المجموعة المطلوب حذفها غير موجودة: ' + name)
              await deleteDeckGroup(group.id); knownGroups.delete(name.toLowerCase())
            } else if (type === 'delete_cards') {
              const deckId = String(action.deckId || '')
              const ids = Array.isArray(action.cardIds) ? action.cardIds.map(String) : []
              if (!knownDecks.has(deckId) || !ids.length) throw new Error('حدد درسًا ومعرّفات الكروت المراد حذفها.')
              const loaded = await loadDeck(deckId)
              const validIds = ids.filter(id => loaded?.cards.some(card => card.id === id))
              if (validIds.length !== ids.length) throw new Error('بعض معرّفات الكروت غير موجودة في الدرس ' + deckId)
              await deleteCards(deckId, validIds)
            } else if (type === 'edit_card') {
              const deckId = String(action.deckId || ''); const cardId = String(action.cardId || '')
              const cloze = String(action.cloze ?? '')
              const loaded = await loadDeck(deckId)
              const card = loaded?.cards.find(c => c.id === cardId)
              if (!card) throw new Error('الكارت المطلوب تعديله غير موجود: ' + cardId)
              if (!cloze.trim()) throw new Error('نص الكارت لا يمكن أن يكون فارغًا.')
              const position = loaded!.cards.findIndex(c => c.id === cardId)
              await saveCard(deckId, { ...card, cloze }, position)
            } else if (type === 'restore_deleted') {
              const recycleBinId = String(action.recycleBinId || '')
              if (!recycleBin.some(item => item.id === recycleBinId)) throw new Error('عنصر سلة المحذوفات غير موجود: ' + recycleBinId)
              await restoreRecycleBinItem(recycleBinId)
            } else { throw new Error('إجراء غير مدعوم: ' + type) }
            completed++
          }
          await finishDeckSave()
          setNotice('تم تنفيذ ' + completed + ' إجراء من Gemini بنجاح.')
          setMessages([...history, { role: 'assistant', text: (parsed.explanation || 'تم تنفيذ طلبك.') + '\n\nتم تنفيذ ' + completed + ' إجراء فعليًا. حدّثت البيانات على الموقع.' }])
        } catch (e) {
          const detail = e instanceof Error ? e.message : 'خطأ غير معروف'
          setError('تم تنفيذ ' + completed + ' من ' + actions.length + ' إجراء قبل حدوث مشكلة: ' + detail + '. راجع البيانات قبل إعادة الطلب.')
        } finally { setApplying(false) }
        return
      }
      if (Array.isArray(parsed.groups) && Array.isArray(parsed.decks)) {
        const next = parsed as Plan
        const used = next.decks.flatMap(d => d.cardIndexes)
        if (!sourceCards.length || used.length !== sourceCards.length || new Set(used).size !== used.length || !used.every(i => Number.isInteger(i) && i >= 0 && i < sourceCards.length)) {
          setMessages([...history, { role: 'assistant', text: 'الخطة لا توزّع كل الكروت مرة واحدة بالضبط، لذلك لم أغيّر الخطة. جرّب طلبًا أوضح.' }])
          return
        }
        setPlan(next)
        setMessages([...history, { role: 'assistant', text: next.explanation || 'عدّلت الخطة. راجعها ثم اضغط تطبيق الخطة.' }])
      } else {
        setMessages([...history, { role: 'assistant', text: parsed.explanation || 'لم أستطع تحديد إجراء قابل للتنفيذ من الرد.' }])
      }
    } catch (e) { setError(e instanceof GeminiError ? e.message : e instanceof Error ? e.message : 'فشل الاتصال بـ Gemini أو قراءة رد JSON.') }
    finally { setBusy(false); setApplying(false) }
  }

  const applyPlan = async () => {
    if (!plan || !sourceCards.length) return
    if (!confirm('سيتم إنشاء مجموعات ودروس جديدة ونسخ البطاقات إليها. لن يتم حذف أو تعديل أي بطاقة أو درس موجود. هل تريد المتابعة؟')) return
    setApplying(true); setError(''); setNotice('')
    try {
      const groupMap = new Map<string, string>()
      for (const name of [...new Set(plan.decks.map(d => d.groupName.trim()).filter(Boolean))]) {
        const existing = groups.find(g => g.name.toLowerCase() === name.toLowerCase())
        const created = existing ?? await createDeckGroup(name)
        groupMap.set(name, created.id)
      }
      const usedIds = new Set(decks.map(d => d.id))
      for (const item of plan.decks) {
        const title = item.title.trim()
        const groupId = groupMap.get(item.groupName.trim())
        if (!title || !groupId) continue
        const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lesson'
        let id = base
        for (let n = 2; usedIds.has(id); n++) id = `${base}-ai-${n}`
        usedIds.add(id)
        await saveDeckMeta({ id, groupId, title, subject: (item.subject || groupName).slice(0, 100), description: (item.description || '').slice(0, 500), isFree: sourceDecks.some(d => d.isFree) })
        for (let position = 0; position < item.cardIndexes.length; position++) {
          const original = sourceCards[item.cardIndexes[position]]
          if (original) await saveCard(id, { id: `ai-${item.cardIndexes[position]}-${original.id}`.slice(0, 64), cloze: original.cloze }, position)
        }
      }
      await finishDeckSave()
      setNotice('تم إنشاء الدروس الجديدة ونسخ البطاقات إليها. البطاقات والدروس الأصلية ما زالت موجودة بدون حذف أو تعديل.')
    } catch (e) { setError(e instanceof Error ? e.message : 'حصل خطأ أثناء تطبيق الخطة. البطاقات الأصلية لم تُحذف.') }
    finally { setApplying(false) }
  }

  return <div className="flex flex-col gap-5">
    <section className="rounded-xl border bg-card p-4 flex flex-col gap-4">
      <div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2"><Sparkles className="size-5 text-primary" /></div><div><h2 className="font-semibold">تنظيم المنهج بالذكاء الاصطناعي</h2><p className="mt-1 text-sm text-muted-foreground">Gemini يحلل محتوى البطاقات ويقترح تقسيمها إلى مجموعات ودروس بأسماء مناسبة. لن يتم حذف أو تعديل أي محتوى موجود؛ التطبيق ينشئ دروسًا جديدة وينسخ البطاقات إليها.</p></div></div>
      {!config && <div className="rounded-lg border p-3 text-sm">لازم تضيف Gemini API Key الأول.</div>}
      <div className="flex flex-col gap-1"><label className="text-sm font-medium">المجموعة المراد تنظيمها</label><select value={sourceGroupId} onChange={e => { setSourceGroupId(e.target.value); setPlan(null); setMessages([]); setSourceCards([]) }} className="rounded-lg border bg-background px-3 py-2 text-sm">{groups.map(g => <option key={g.id} value={g.id}>{g.name} — {decks.filter(d => d.groupId === g.id).length} درس</option>)}</select><p className="text-xs text-muted-foreground">هيحلل كل كروت الدروس الموجودة داخل المجموعة المختارة ({sourceDecks.reduce((n,d)=>n+d.cardCount,0)} بطاقة).</p></div>
      <div className="flex flex-wrap gap-2"><Button onClick={makePlan} disabled={busy || applying || !sourceGroupId}><Sparkles className="size-4" />{busy ? 'Gemini بيحلل المحتوى...' : 'حلّل وقسّم المنهج'}</Button><Button variant="outline" onClick={() => setShowKey(true)}>إعدادات Gemini / API Key</Button></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-600/30 bg-green-600/5 p-3 text-sm">{notice}</p>}
    </section>
    {plan && <section className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <h3 className="font-semibold">الخطة المقترحة — {plan.decks.length} درس</h3>
      <p className="text-xs text-muted-foreground">راجع الأسماء وتوزيع البطاقات. التطبيق لا يمسح الأصل؛ يضيف نسخًا منظمة فقط.</p>
      <div className="flex flex-col gap-3">{plan.decks.map((d,i)=><div key={i} className="rounded-lg border p-3"><div className="font-medium">{d.groupName} / {d.title}</div><div className="mt-1 text-xs text-muted-foreground">{d.cardIndexes.length} بطاقة{d.description ? ` — ${d.description}` : ''}</div></div>)}</div>
      <Button onClick={applyPlan} disabled={applying || busy}>{applying && <Loader2 className="size-4 animate-spin" />}{applying ? 'جاري إنشاء الدروس ونسخ البطاقات...' : 'تطبيق الخطة وإنشاء الدروس الجديدة'}</Button>
    </section>}
    <section className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2"><MessageCircle className="size-5" /><h3 className="font-semibold">شات مع Gemini</h3></div>
      <p className="text-sm text-muted-foreground">الشات يقدر ينفّذ أوامر فعلية بعد تأكيدك: إنشاء/تعديل/نقل/حذف المجموعات والدروس، تعديل أو حذف الكروت، واستعادة المحذوفات. اكتب طلبك بوضوح، وسيعرض الإجراءات قبل تنفيذها.</p>
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">{messages.map((m,i)=><div key={i} className={`max-w-full whitespace-pre-wrap rounded-lg p-3 text-sm ${m.role === 'user' ? 'self-start bg-muted' : 'self-stretch border'}`}>{m.role === 'assistant' && <Bot className="mb-1 inline size-4" />} {m.text}</div>)}</div>
      <div className="flex gap-2"><textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="مثال: أنشئ مجموعة جديدة باسم الجهاز الهضمي، وانقل درس كذا إليها..." rows={2} className="min-w-0 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm" /><Button onClick={sendChat} disabled={busy || !chatInput.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : 'إرسال'}</Button>{busy && <Button type="button" variant="destructive" size="icon" onClick={() => abortRef.current?.abort()} aria-label="إيقاف الذكاء الاصطناعي" title="إيقاف الذكاء الاصطناعي"><Square className="size-4 fill-current" /></Button>}</div>
    </section>
    {showKey && <ApiKeyDialog open={showKey} onClose={() => setShowKey(false)} />}
  </div>
}
