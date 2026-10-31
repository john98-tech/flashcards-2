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

async function signedAudioUrl(path: string) {
  const { data, error } = await db().storage.from('card-audio').createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'تعذر إنشاء رابط الصوت.')
  return data.signedUrl
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
    .select('source_hash,audio_path,model,voice,timings,status').eq('deck_id', deckId).eq('card_id', cardId).maybeSingle()
  const model = 'gemini-3.8-flash-lite-tts'
  // Prefer Fyra/Fira if present; otherwise choose a clear female audiobook
  // voice from Google's catalog. Aoede is the stable fallback.
  let voice = 'Aoede'
  for (const requestedName of ['Fyra', 'Fira']) {
    try {
      const params = new URLSearchParams({ search: requestedName, type: 'prebuilt', gender: 'female', page_size: '100' })
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/voices?${params.toString()}`, {
        headers: { 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      })
      if (!response.ok) continue
      const catalog = await response.json().catch(() => null)
      const match = Array.isArray(catalog?.voices)
        ? catalog.voices.find((item: any) =>
            String(item.display_name ?? '').trim().toLowerCase() === requestedName.toLowerCase() &&
            String(item.gender ?? '').toLowerCase() === 'female' &&
            typeof item.id === 'string' && item.id.length > 0,
          )
        : null
      if (match?.id) { voice = match.id; break }
    } catch {
      // Continue to the general female audiobook voice lookup.
    }
  }
  if (voice === 'Aoede') {
    try {
      const params = new URLSearchParams({ search: 'clear', type: 'prebuilt', gender: 'female', context: 'Audiobook', page_size: '100' })
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/voices?${params.toString()}`, {
        headers: { 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      })
      const catalog = response.ok ? await response.json().catch(() => null) : null
      const match = Array.isArray(catalog?.voices)
        ? catalog.voices.find((item: any) =>
            String(item.gender ?? '').toLowerCase() === 'female' &&
            typeof item.id === 'string' && item.id.length > 0 &&
            /clear|warm|friendly|narrat/i.test(String(item.description ?? '')),
          )
        : null
      if (match?.id) voice = match.id
    } catch {
      // Aoede remains the known-good female-presenting fallback.
    }
  }
  if (existing?.source_hash === sourceHash && existing.voice === voice && existing.model === model) {
    return NextResponse.json({ url: await signedAudioUrl(existing.audio_path), reused: true, model: existing.model, voice: existing.voice, timings: existing.timings ?? [], timingStatus: existing.status ?? 'needs_review' })
  }

  const ttsResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [{
        type: 'user_input',
        content: [{
          type: 'text',
          text,
          annotations: [{
            type: 'speech_metadata',
            style: 'Use a clearly feminine, bright, confident studio audiobook narrator voice. Sound natural, warm, articulate and engaging, with a full, strong, consistently projected speaking level from the very first word to the final word. Keep loudness even throughout; do not trail off, fade, whisper, mumble, or reduce volume near the ending. Speak English at a measured medium-slow pace with crisp consonants and precise medical terminology. Use gentle emphasis on key terms and brief natural pauses only at punctuation and between list items. Read every word exactly; do not add or omit anything.',
          }],
        }],
      }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
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

  let audio = Buffer.from(audioBase64, 'base64')
  // Even out the perceived level across the whole card so the last words
  // stay as present and intelligible as the opening. WAV is PCM16 mono.
  function levelWav(input: Buffer) {
    const output = Buffer.from(input)
    let dataStart = -1
    let dataSize = 0
    let format = 0
    let bits = 0
    for (let offset = 12; offset + 8 <= output.length;) {
      const id = output.toString('ascii', offset, offset + 4)
      const size = output.readUInt32LE(offset + 4)
      const start = offset + 8
      if (id === 'fmt ' && size >= 16 && start + 16 <= output.length) {
        format = output.readUInt16LE(start)
        bits = output.readUInt16LE(start + 14)
      }
      if (id === 'data') { dataStart = start; dataSize = Math.min(size, output.length - start); break }
      offset = start + size + (size % 2)
    }
    if (dataStart < 0 || format !== 1 || bits !== 16) return output
    const samples = Math.floor(dataSize / 2)
    const windowSamples = 480 // 20 ms at 24 kHz
    let gain = 1
    const targetRms = 0.19
    for (let base = 0; base < samples; base += windowSamples) {
      const end = Math.min(samples, base + windowSamples)
      let sum = 0
      for (let i = base; i < end; i++) {
        const value = output.readInt16LE(dataStart + i * 2) / 32768
        sum += value * value
      }
      const rms = Math.sqrt(sum / Math.max(1, end - base))
      const wanted = rms < 0.0018 ? 1 : Math.min(2.4, Math.max(0.82, targetRms / rms))
      const smoothing = wanted < gain ? 0.55 : 0.22
      gain += (wanted - gain) * smoothing
      for (let i = base; i < end; i++) {
        const sampleOffset = dataStart + i * 2
        const value = output.readInt16LE(sampleOffset) * gain
        output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), sampleOffset)
      }
    }
    return output
  }
  audio = levelWav(audio)
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
    mime_type: 'audio/wav', model, voice,
    timings: [], status: 'needs_review', updated_at: new Date().toISOString(),
  }, { onConflict: 'deck_id,card_id' })
  if (saveError) return NextResponse.json({ error: `تم إنشاء الصوت لكن تعذر حفظ بياناته: ${saveError.message}` }, { status: 500 })

  return NextResponse.json({ url: await signedAudioUrl(path), reused: false, model, voice, timings: [], timingStatus: 'pending' })
}
