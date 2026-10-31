import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'
import { plainText } from '@/lib/cloze'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function spokenText(cloze: string) {
  return plainText(cloze).split(/\r?\n/)
    .filter(line => !/^\s*>>/.test(line))
    .map(line => line.replace(/^\s*#{1,4}\s*/, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/&/g, 'and').replace(/\|/g, ', ').trimEnd())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function readPcmWav(wav: Buffer) {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('أحد ملفات الصوت غير صالح.')
  let format = 0, channels = 0, sampleRate = 0, bits = 0
  let pcm: Buffer | null = null
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4), start = offset + 8
    if (start + size > wav.length) throw new Error('ملف صوت أحد الكروت غير مكتمل.')
    if (id === 'fmt ' && size >= 16) { format = wav.readUInt16LE(start); channels = wav.readUInt16LE(start + 2); sampleRate = wav.readUInt32LE(start + 4); bits = wav.readUInt16LE(start + 14) }
    if (id === 'data') { pcm = wav.subarray(start, start + size); break }
    offset = start + size + (size % 2)
  }
  if (format !== 1 || channels !== 1 || bits !== 16 || !sampleRate || !pcm) throw new Error('صيغة الصوت غير متوافقة؛ المطلوب WAV PCM mono 16-bit.')
  return { pcm, sampleRate }
}

function offsetMs(value: unknown) {
  if (typeof value !== 'string') return NaN
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s)$/)
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : NaN
}
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en-US')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[^\p{L}\p{N}]+/gu, '')

function alignWords(expected: string[], actual: { word: string; startMs: number; endMs: number }[]) {
  const rows = expected.length + 1, cols = actual.length + 1
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  const back = Array.from({ length: rows }, () => new Array<'match' | 'delete' | 'insert' | 'substitute'>(cols))
  for (let i = 1; i < rows; i++) { dp[i][0] = i; back[i][0] = 'delete' }
  for (let j = 1; j < cols; j++) { dp[0][j] = j; back[0][j] = 'insert' }
  for (let i = 1; i < rows; i++) for (let j = 1; j < cols; j++) {
    const same = normalize(expected[i - 1]) === normalize(actual[j - 1].word)
    const choices = [
      { cost: dp[i - 1][j - 1] + (same ? 0 : 1), op: same ? 'match' as const : 'substitute' as const },
      { cost: dp[i - 1][j] + 1, op: 'delete' as const },
      { cost: dp[i][j - 1] + 1, op: 'insert' as const },
    ]
    const best = choices.reduce((a, b) => b.cost < a.cost ? b : a)
    dp[i][j] = best.cost; back[i][j] = best.op
  }
  const matched: ({ word: string; startMs: number; endMs: number; sourceIndex: number })[] = []
  let i = expected.length, j = actual.length
  while (i > 0 || j > 0) {
    const op = back[i][j]
    if (op === 'match') { matched.push({ ...actual[j - 1], sourceIndex: i - 1 }); i--; j-- }
    else if (op === 'substitute') { i--; j-- }
    else if (op === 'delete') i--
    else if (op === 'insert') j--
    else break
  }
  matched.reverse()
  return matched
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY غير موجود في إعدادات Vercel.' }, { status: 500 })
  const body = await request.json().catch(() => null) as { groupId?: string; cardIds?: string[] } | null
  const groupId = body?.groupId?.trim()
  const requestedCardIds = Array.isArray(body?.cardIds) ? new Set(body.cardIds.filter((id): id is string => typeof id === 'string' && id.length > 0)) : null
  if (requestedCardIds && (!requestedCardIds.size || requestedCardIds.size > 100)) return NextResponse.json({ error: 'عدد الكروت المطلوب مزامنتها غير صحيح.' }, { status: 400 })
  if (!groupId || groupId.length > 160) return NextResponse.json({ error: 'معرّف الجروب غير صحيح.' }, { status: 400 })

  const client = db()
  const { data: decks, error: decksError } = await client.from('decks').select('id').eq('group_id', groupId).order('created_at')
  if (decksError) return NextResponse.json({ error: decksError.message }, { status: 500 })
  if (!decks?.length) return NextResponse.json({ error: 'الجروب لا يحتوي على ديكس.' }, { status: 404 })
  const allCards: { id: string; deckId: string; cloze: string }[] = []
  for (const deckRow of decks) {
    const { data, error } = await client.from('cards').select('id,cloze').eq('deck_id', deckRow.id).order('position')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const card of data ?? []) if (!requestedCardIds || requestedCardIds.has(card.id)) allCards.push({ id: card.id, deckId: deckRow.id, cloze: card.cloze })
  }
  if (!allCards.length) return NextResponse.json({ error: 'الجروب لا يحتوي على كروت.' }, { status: 404 })
  if (allCards.length > 2000) return NextResponse.json({ error: 'الجروب يحتوي على أكثر من 2000 كارد؛ قسّمه إلى مجموعتين للمزامنة.' }, { status: 413 })

  const silenceMs = 900
  const pieces: Buffer[] = []
  const cardRanges: { id: string; deckId: string; text: string; startMs: number; endMs: number; cloze: string }[] = []
  let sampleRate = 0, totalBytes = 0, cursorMs = 0
  for (let index = 0; index < allCards.length; index++) {
    const { id: cardId, deckId, cloze } = allCards[index]
    const [{ data: asset, error: assetError }] = await Promise.all([
      client.from('card_audio_assets').select('audio_path,source_hash').eq('deck_id', deckId).eq('card_id', cardId).maybeSingle(),
    ])
    const card = { cloze }
    if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 })
    if (!asset) return NextResponse.json({ error: 'صوت الكارد رقم ' + (index + 1) + ' في الجروب غير جاهز. جهّز أصوات كل ديكس الجروب أولًا.' }, { status: 409 })
    const text = spokenText(card.cloze)
    const hash = createHash('sha256').update(text).digest('hex')
    if (hash !== asset.source_hash) return NextResponse.json({ error: 'نص الكارد رقم ' + (index + 1) + ' اتغير؛ أعد تجهيز صوته.' }, { status: 409 })
    const { data: file, error: downloadError } = await client.storage.from('card-audio').download(asset.audio_path)
    if (downloadError || !file) return NextResponse.json({ error: 'تعذر تحميل صوت الكارد رقم ' + (index + 1) }, { status: 500 })
    const parsed = readPcmWav(Buffer.from(await file.arrayBuffer()))
    if (!sampleRate) sampleRate = parsed.sampleRate
    if (parsed.sampleRate !== sampleRate) return NextResponse.json({ error: 'معدل الصوت مختلف بين الكروت.' }, { status: 409 })
    const durationMs = parsed.pcm.length / (sampleRate * 2) * 1000
    cardRanges.push({ id: cardId, deckId, text, cloze: card.cloze, startMs: cursorMs, endMs: cursorMs + durationMs })
    pieces.push(parsed.pcm); totalBytes += parsed.pcm.length; cursorMs += durationMs
    if (index < allCards.length - 1) {
      const silence = Buffer.alloc(Math.round(sampleRate * silenceMs / 1000) * 2)
      pieces.push(silence); totalBytes += silence.length; cursorMs += silenceMs
    }
    if (totalBytes > 45 * 1024 * 1024) return NextResponse.json({ error: 'حجم صوت الجروب أكبر من الحد الآمن للرفع. قسّم الجروب إلى مجموعتين أصغر.' }, { status: 413 })
  }

  if (cursorMs > 30 * 60 * 1000) return NextResponse.json({ error: 'مدة صوت الجروب تتجاوز 30 دقيقة، وهو الحد المدعوم لتوقيتات الكلمات. قسّم الجروب إلى جزأين.' }, { status: 413 })

  try {
    const pcm = Buffer.concat(pieces, totalBytes)
    const wav = Buffer.alloc(44 + pcm.length)
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44)

    const startUpload = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(wav.length), 'X-Goog-Upload-Header-Content-Type': 'audio/wav', 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: { display_name: 'group-' + groupId + '-full-audio' } }),
      signal: AbortSignal.timeout(20000),
    })
    const uploadUrl = startUpload.headers.get('x-goog-upload-url')
    if (!startUpload.ok || !uploadUrl) throw new Error('تعذر بدء رفع ملف الديك إلى Gemini.')
    const uploaded = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Length': String(wav.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), signal: AbortSignal.timeout(60000) })
    const fileData = await uploaded.json().catch(() => null)
    const fileUri = fileData?.file?.uri
    if (!uploaded.ok || typeof fileUri !== 'string') throw new Error('فشل رفع ملف الديك إلى Gemini.')
    const transcription = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-3.5-transcribe', input: [{ type: 'audio', uri: fileUri, mime_type: 'audio/wav' }], generation_config: { transcription_config: { language_codes: [], mode: { type: 'verbatim', timestamp_granularities: ['word'] } } } }),
      signal: AbortSignal.timeout(180000),
    })
    const transcriptData = await transcription.json().catch(() => null)
    if (!transcription.ok) throw new Error(transcriptData?.error?.message || 'Gemini Transcribe لم يتمكن من تحليل صوت الجروب.')
    const found: { word: string; startMs: number; endMs: number }[] = []
    const visit = (value: any) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) { value.forEach(visit); return }
      if (value.type === 'word_info' && typeof value.text === 'string') {
        const startMs = offsetMs(value.start_offset), endMs = offsetMs(value.end_offset)
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) found.push({ word: value.text, startMs, endMs })
      }
      Object.values(value).forEach(visit)
    }
    visit(transcriptData)
    if (!found.length) throw new Error('Gemini لم يرجع توقيتات كلمات. لم يتم تعديل توقيتات الكروت المحفوظة.')
    const summaries: { cardId: string; status: string; words: number }[] = []
    for (const item of cardRanges) {
      const segment = found.filter(word => word.startMs >= item.startMs - 100 && word.endMs <= item.endMs + 150)
      const expected = item.text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []
      const matched = alignWords(expected, segment)
      const blankWords = [...item.cloze.matchAll(/\{\{([\s\S]+?)\}\}/g)].flatMap(match => match[1].match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []).map(normalize).filter(Boolean)
      const matchedCounts = new Map<string, number>()
      for (const word of matched) { const key = normalize(expected[word.sourceIndex]); matchedCounts.set(key, (matchedCounts.get(key) ?? 0) + 1) }
      const required = new Map<string, number>()
      for (const word of blankWords) required.set(word, (required.get(word) ?? 0) + 1)
      const blanksFound = [...required].every(([word, count]) => (matchedCounts.get(word) ?? 0) >= count)
      const coverage = expected.length ? matched.length / expected.length : 0
      const ready = expected.length > 0 && coverage >= 0.78 && blanksFound
      const timings = ready ? matched.map(word => ({ ...word, startMs: Math.max(0, word.startMs - item.startMs), endMs: Math.max(0, word.endMs - item.startMs) })) : []
      const { error } = await client.from('card_audio_assets').update({ timings, status: ready ? 'ready' : 'needs_review', updated_at: new Date().toISOString() }).eq('deck_id', item.deckId).eq('card_id', item.id)
      if (error) throw new Error('تعذر حفظ توقيتات أحد الكروت: ' + error.message)
      summaries.push({ cardId: item.id, status: ready ? 'ready' : 'needs_review', words: timings.length })
    }
    return NextResponse.json({ ok: true, cards: summaries, transcribedWords: found.length, readyCards: summaries.filter(item => item.status === 'ready').length, reviewCards: summaries.filter(item => item.status !== 'ready').length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر تحليل صوت الجروب.'
    const rateLimited = /rate.?limit|quota|429|resource_exhausted/i.test(message)
    return NextResponse.json({ error: message, code: rateLimited ? 'TRANSCRIPTION_RATE_LIMIT' : 'DECK_TIMING_FAILED' }, { status: rateLimited ? 429 : 502 })
  }
}
