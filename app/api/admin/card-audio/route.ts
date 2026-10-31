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
    .map(line => line.replace(/^\s*#{1,4}\s*/, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\|/g, ', ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function publicAudioUrl(path: string) {
  return db().storage.from('card-audio').getPublicUrl(path).data.publicUrl
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
  const { data: card, error: cardError } = await client.from('cards')
    .select('deck_id,id,cloze').eq('deck_id', deckId).eq('id', cardId).maybeSingle()
  if (cardError) return NextResponse.json({ error: cardError.message }, { status: 500 })
  if (!card) return NextResponse.json({ error: 'الكارد غير موجود.' }, { status: 404 })

  const text = spokenText(card.cloze)
  if (!text) return NextResponse.json({ error: 'الكارد لا يحتوي على نص قابل للقراءة.' }, { status: 400 })
  const sourceHash = createHash('sha256').update(text).digest('hex')
  const { data: existing } = await client.from('card_audio_assets')
    .select('source_hash,audio_path,model,voice').eq('deck_id', deckId).eq('card_id', cardId).maybeSingle()
  if (existing?.source_hash === sourceHash) {
    return NextResponse.json({ url: publicAudioUrl(existing.audio_path), reused: true, model: existing.model, voice: existing.voice })
  }

  const ttsResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-3.8-flash-tts',
      input: [{
        type: 'user_input',
        content: [{
          type: 'text',
          text,
          annotations: [{
            type: 'speech_metadata',
            style: 'Read this medical study card as a clear, natural, warm and engaging human tutor. Speak English carefully at a moderate pace, pronounce scientific terminology precisely, use gentle emphasis on important terms, and pause naturally at punctuation and between list items. Do not add or omit words.',
          }],
        }],
      }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: 'Kore' }] },
    }),
    signal: AbortSignal.timeout(55000),
  })
  const ttsData = await ttsResponse.json().catch(() => null)
  if (!ttsResponse.ok) {
    const message = ttsData?.error?.message || 'Gemini لم يتمكن من إنشاء الصوت.'
    return NextResponse.json({ error: message }, { status: ttsResponse.status >= 400 && ttsResponse.status < 600 ? ttsResponse.status : 502 })
  }
  const audioBase64 = ttsData?.output_audio?.data
    ?? ttsData?.steps?.flatMap((step: any) => step.content ?? []).find((part: any) => part.type === 'audio')?.data
  if (typeof audioBase64 !== 'string' || !audioBase64) {
    return NextResponse.json({ error: 'Gemini رجّع استجابة بدون ملف صوت صالح.' }, { status: 502 })
  }

  const audio = Buffer.from(audioBase64, 'base64')
  if (audio.length < 1000 || audio.length > 50 * 1024 * 1024 || audio.toString('ascii', 0, 4) !== 'RIFF') {
    return NextResponse.json({ error: 'ملف الصوت الناتج غير صالح أو ليس WAV مكتملًا.' }, { status: 502 })
  }
  const path = `${deckId}/${cardId}-${sourceHash.slice(0, 16)}.wav`
  const { error: uploadError } = await client.storage.from('card-audio').upload(path, audio, {
    contentType: 'audio/wav', upsert: true, cacheControl: '31536000',
  })
  if (uploadError) return NextResponse.json({ error: `فشل حفظ ملف الصوت: ${uploadError.message}` }, { status: 500 })

  const { error: saveError } = await client.from('card_audio_assets').upsert({
    deck_id: deckId, card_id: cardId, source_hash: sourceHash, audio_path: path,
    mime_type: 'audio/wav', model: 'gemini-3.8-flash-tts', voice: 'Kore',
    word_timings: [], updated_at: new Date().toISOString(),
  }, { onConflict: 'deck_id,card_id' })
  if (saveError) return NextResponse.json({ error: `تم إنشاء الصوت لكن تعذر حفظ بياناته: ${saveError.message}` }, { status: 500 })

  return NextResponse.json({ url: publicAudioUrl(path), reused: false, model: 'gemini-3.8-flash-tts', voice: 'Kore' })
}
