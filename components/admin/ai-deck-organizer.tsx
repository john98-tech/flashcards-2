'use client'

import { useMemo, useState } from 'react'
import { Bot, Loader2, MessageCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiKeyDialog } from '@/components/gemini/api-key-dialog'
import { GeminiError, generate, useGeminiConfig } from '@/lib/gemini'
import type { Deck, Card } from '@/lib/cloze'
import type { DeckGroup, DeckSummary } from '@/lib/decks'
import { createDeckGroup, finishDeckSave, loadDeck, saveCard, saveDeckMeta } from '@/app/admin/actions'

type PlanDeck = { title: string; subject?: string; description?: string; groupName: string; cardIndexes: number[] }
type Plan = { groups: string[]; decks: PlanDeck[]; explanation?: string }
type Message = { role: 'user' | 'assistant'; text: string }

const SYSTEM = `أنت مساعد لتنظيم منهج دراسي داخل تطبيق فلاش كاردس. مهمتك تنظيم البطاقات الموجودة فقط حسب موضوعها وتسلسل المنهج، واقتراح أسماء واضحة للمجموعات والـdecks والدروس. لا تعِد كتابة محتوى البطاقات ولا تخترع بطاقات. عندما يُطلب منك إنشاء خطة تنظيم، أرجع JSON فقط بالشكل: { "groups": ["اسم المجموعة"], "decks": [{ "title":"اسم الدرس", "subject":"المادة", "description":"وصف مختصر", "groupName":"اسم المجموعة", "cardIndexes":[0,1] }], "explanation":"ملخص" }. استخدم أرقام البطاقات من القائمة كما هي، ووزع كل بطاقة مرة واحدة فقط. لا تحذف ولا تستبدل أي بطاقة موجودة. في المحادثة العادية أجب بالعربية بوضوح، وإذا طلب المستخدم تعديل الخطة فأعد JSON بنفس الشكل.`

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
    setBusy(true); setError(''); setNotice('')
    try {
      const { cards } = await getCards()
      if (!cards.length) throw new Error('المجموعة دي مفيهاش كروت.')
      const compact = cards.map((c, i) => ({ index: i, text: c.cloze }))
      const response = await generate(config, `نظّم كل بطاقات مجموعة "${groupName}" إلى مجموعات وdecks/دروس مناسبة حسب المحتوى. لا تغيّر نص أي بطاقة. أدرج كل index مرة واحدة بالضبط. البطاقات: ${JSON.stringify(compact)}`, { system: SYSTEM, json: true, temperature: 0.1 })
      const next = parsePlan(response)
      const used = next.decks.flatMap(d => d.cardIndexes)
      if (used.some(i => !Number.isInteger(i) || i < 0 || i >= cards.length)) throw new Error('الخطة فيها أرقام بطاقات غير صحيحة.')
      if (new Set(used).size !== used.length) throw new Error('الخطة كررت بعض البطاقات. أعد المحاولة.')
      if (used.length !== cards.length) throw new Error(`Gemini وزّع ${used.length} من أصل ${cards.length} بطاقة فقط. لم يتم تطبيق أي تغيير؛ جرّب مرة أخرى أو اطلب منه توزيع كل البطاقات.`)
      setPlan(next)
      setMessages([{ role: 'assistant', text: next.explanation || `اقترحت ${next.groups.length} مجموعات و${next.decks.length} دروس. راجع الخطة قبل التطبيق.` }])
    } catch (e) { setError(e instanceof Error ? e.message : 'حصل خطأ أثناء التنظيم.') }
    finally { setBusy(false) }
  }

  const sendChat = async () => {
    const prompt = chatInput.trim()
    if (!prompt) return
    if (!config) { setShowKey(true); return }
    const history = [...messages, { role: 'user' as const, text: prompt }]
    setMessages(history); setChatInput(''); setBusy(true); setError('')
    try {
      const context = plan ? `الخطة الحالية: ${JSON.stringify(plan)}` : 'لا توجد خطة بعد.'
      const response = await generate(config, `${context}\nطلب المستخدم: ${prompt}\nإذا كان الطلب تعديلًا للخطة، أرجع JSON كاملًا مطابقًا للمخطط، مع الحفاظ على كل البطاقات وتوزيع كل index مرة واحدة. وإذا كان سؤالًا فقط، أجب نصيًا.`, { system: SYSTEM, temperature: 0.2 })
      try {
        const next = parsePlan(response)
        const used = next.decks.flatMap(d => d.cardIndexes)
        if (sourceCards.length && used.length === sourceCards.length && new Set(used).size === used.length && used.every(i => Number.isInteger(i) && i >= 0 && i < sourceCards.length)) {
          setPlan(next)
          setMessages([...history, { role: 'assistant', text: next.explanation || 'عدّلت الخطة. راجعها قبل التطبيق.' }])
        } else setMessages([...history, { role: 'assistant', text: response }])
      } catch { setMessages([...history, { role: 'assistant', text: response }]) }
    } catch (e) { setError(e instanceof GeminiError ? e.message : e instanceof Error ? e.message : 'فشل الاتصال بـ Gemini.') }
    finally { setBusy(false) }
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
      <p className="text-sm text-muted-foreground">اطلب منه مثلًا: «قسّم درس الظهارة لوحده»، «سمّي الدروس بأسماء أقصر»، أو «رتّب الدروس حسب تسلسل الكتاب». لو طلبت تعديل الخطة، راجعها ثم طبّقها.</p>
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">{messages.map((m,i)=><div key={i} className={`max-w-full whitespace-pre-wrap rounded-lg p-3 text-sm ${m.role === 'user' ? 'self-start bg-muted' : 'self-stretch border'}`}>{m.role === 'assistant' && <Bot className="mb-1 inline size-4" />} {m.text}</div>)}</div>
      <div className="flex gap-2"><textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="اكتب طلبك لتعديل الخطة أو اسأل Gemini..." rows={2} className="min-w-0 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm" /><Button onClick={sendChat} disabled={busy || !chatInput.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : 'إرسال'}</Button></div>
    </section>
    {showKey && <ApiKeyDialog open={showKey} onClose={() => setShowKey(false)} />}
  </div>
}
