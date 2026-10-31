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
    const aligned = expected.length > 0 && expected.length === actual.length
      && expected.every((word, index) => normalize(word) === normalize(actual[index]))
    const timings = aligned ? found : []
    const status = aligned ? 'ready' : 'review'
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
    await client.from('card_audio_assets').update({ status: 'review', timings: [], updated_at: new Date().toISOString() }).eq('deck_id', deckId).eq('card_id', cardId)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تحليل توقيتات الصوت.' }, { status: 502 })
  }
}
