import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'
import { plainText } from '@/lib/cloze'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function spokenText(cloze: string) {
  return plainText(cloze)
    .split(/\r?\n/)
    .filter(line => !/^\s*>>/.test(line))
    .map(line => line.replace(/^\s*#{1,4}\s*/, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/&/g, 'and').replace(/\|/g, ', ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function offsetMs(value: unknown) {
  if (typeof value !== 'string') return NaN
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s)$/)
  if (!match) return NaN
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY غير موجود في إعدادات Vercel.' }, { status: 500 })

  const body = await request.json().catch(() => null) as { deckId?: string; cardId?: string } | null
  const deckId = body?.deckId?.trim()
  const cardId = body?.cardId?.trim()
  if (!deckId || !cardId || deckId.length > 160 || cardId.length > 160) {
    return NextResponse.json({ error: 'بيانات الكارد غير صحيحة.' }, { status: 400 })
  }

  const client = db()
  const [{ data: card, error: cardError }, { data: asset, error: assetError }] = await Promise.all([
    client.from('cards').select('cloze').eq('deck_id', deckId).eq('id', cardId).maybeSingle(),
    client.from('card_audio_assets').select('audio_path,source_hash,status').eq('deck_id', deckId).eq('card_id', cardId).maybeSingle(),
  ])
  if (cardError || assetError) return NextResponse.json({ error: cardError?.message || assetError?.message }, { status: 500 })
  if (!card || !asset) return NextResponse.json({ error: 'الصوت أو الكارد غير موجود.' }, { status: 404 })

  const text = spokenText(card.cloze)
  const sourceHash = createHash('sha256').update(text).digest('hex')
  if (sourceHash !== asset.source_hash) return NextResponse.json({ error: 'نص الكارد اتغير؛ أعد إنشاء الصوت أولًا.' }, { status: 409 })
  if (asset.status === 'ready') {
    const { data } = await client.from('card_audio_assets').select('timings').eq('deck_id', deckId).eq('card_id', cardId).maybeSingle()
    return NextResponse.json({ status: 'ready', timings: data?.timings ?? [], reused: true })
  }

  try {
    const { data: audioFile, error: downloadError } = await client.storage.from('card-audio').download(asset.audio_path)
    if (downloadError || !audioFile) throw new Error(downloadError?.message || 'تعذر قراءة ملف الصوت المحفوظ.')
    const audio = Buffer.from(await audioFile.arrayBuffer())
    const startUpload = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(audio.length),
        'X-Goog-Upload-Header-Content-Type': 'audio/wav',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'card-' + cardId } }),
      signal: AbortSignal.timeout(12000),
    })
    const uploadUrl = startUpload.headers.get('x-goog-upload-url')
    if (!startUpload.ok || !uploadUrl) throw new Error('تعذر بدء رفع الصوت إلى Gemini للتحليل.')
    const uploaded = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(audio.length),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: new Blob([new Uint8Array(audio)], { type: 'audio/wav' }),
      signal: AbortSignal.timeout(15000),
    })
    const fileData = await uploaded.json().catch(() => null)
    const fileUri = fileData?.file?.uri
    if (!uploaded.ok || typeof fileUri !== 'string') throw new Error('فشل رفع ملف الصوت إلى Gemini.')

    const transcription = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3.5-transcribe',
        input: [{ type: 'audio', uri: fileUri, mime_type: 'audio/wav' }],
        generation_config: {
          transcription_config: {
            language_codes: ['en-US'],
            mode: { type: 'verbatim', timestamp_granularities: ['word'] },
          },
        },
      }),
      signal: AbortSignal.timeout(25000),
    })
    const transcriptData = await transcription.json().catch(() => null)
    if (!transcription.ok) throw new Error(transcriptData?.error?.message || 'تعذر استخراج توقيتات الكلمات من الصوت.')

    const found: { word: string; startMs: number; endMs: number }[] = []
    const visit = (value: any) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) { value.forEach(visit); return }
      if (value.type === 'word_info' && typeof value.text === 'string') {
        const startMs = offsetMs(value.start_offset)
        const endMs = offsetMs(value.end_offset)
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
          found.push({ word: value.text, startMs, endMs })
        }
      }
      Object.values(value).forEach(visit)
    }
    visit(transcriptData)

    const normalize = (value: string) => value.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, '')
    const expected = text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []
    const actual = found.map(item => item.word)
    // Align the transcript to the source instead of requiring the ASR to return
    // exactly the same token count. Unmatched words stay unhighlighted; sourceIndex
    // prevents one omitted article from shifting every later word.
    const rows = expected.length + 1
    const cols = actual.length + 1
    const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
    const back = Array.from({ length: rows }, () => new Array<'match' | 'delete' | 'insert' | 'substitute'>(cols))
    for (let i = 1; i < rows; i++) { dp[i][0] = i; back[i][0] = 'delete' }
    for (let j = 1; j < cols; j++) { dp[0][j] = j; back[0][j] = 'insert' }
    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const same = normalize(expected[i - 1]) === normalize(actual[j - 1])
        const choices = [
          { cost: dp[i - 1][j - 1] + (same ? 0 : 1), op: same ? 'match' as const : 'substitute' as const },
          { cost: dp[i - 1][j] + 1, op: 'delete' as const },
          { cost: dp[i][j - 1] + 1, op: 'insert' as const },
        ]
        const best = choices.reduce((a, b) => b.cost < a.cost ? b : a)
        dp[i][j] = best.cost
        back[i][j] = best.op
      }
    }
    const matched: (typeof found[number] & { sourceIndex: number })[] = []
    let i = expected.length
    let j = actual.length
    while (i > 0 || j > 0) {
      const op = back[i][j]
      if (op === 'match') { matched.push({ ...found[j - 1], sourceIndex: i - 1 }); i--; j-- }
      else if (op === 'substitute') { i--; j-- }
      else if (op === 'delete') i--
      else if (op === 'insert') j--
      else break
    }
    matched.reverse()
    const blankWords = [...String(card.cloze).matchAll(/\{\{([\s\S]+?)\}\}/g)]
      .flatMap(match => match[1].match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? [])
      .map(normalize)
      .filter(Boolean)
    const matchedCounts = new Map<string, number>()
    for (const item of matched) {
      const key = normalize(expected[item.sourceIndex])
      matchedCounts.set(key, (matchedCounts.get(key) ?? 0) + 1)
    }
    const allBlankWordsMatched = blankWords.every(word => (matchedCounts.get(word) ?? 0) > 0)
    const coverage = expected.length ? matched.length / expected.length : 0
    const aligned = expected.length > 0 && coverage >= 0.88 && allBlankWordsMatched
    const timings = aligned ? matched : []
    const status = aligned ? 'ready' : 'needs_review'
    const { error: saveError } = await client.from('card_audio_assets').update({
      timings,
      status,
      updated_at: new Date().toISOString(),
    }).eq('deck_id', deckId).eq('card_id', cardId)
    if (saveError) throw new Error(saveError.message)
    return NextResponse.json({
      status,
      timings,
      message: aligned ? undefined : 'الصوت محفوظ، لكن التفريغ لم يطابق نص الكارد بدقة؛ تم تعطيل التظليل الآلي لهذا الكارد لحين المراجعة.',
    })
  } catch (error) {
    await client.from('card_audio_assets').update({ status: 'needs_review', timings: [], updated_at: new Date().toISOString() }).eq('deck_id', deckId).eq('card_id', cardId)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تحليل توقيتات الصوت.' }, { status: 502 })
  }
}
