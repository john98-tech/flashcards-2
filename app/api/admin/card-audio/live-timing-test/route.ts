import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function toPcm16k(wav: Buffer) {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('ملف الصوت ليس WAV صالحًا.')
  }
  let format = 0
  let channels = 0
  let sampleRate = 0
  let bits = 0
  let dataStart = -1
  let dataSize = 0
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size > wav.length) break
    if (id === 'fmt ' && size >= 16) {
      format = wav.readUInt16LE(start)
      channels = wav.readUInt16LE(start + 2)
      sampleRate = wav.readUInt32LE(start + 4)
      bits = wav.readUInt16LE(start + 14)
    }
    if (id === 'data') { dataStart = start; dataSize = size; break }
    offset = start + size + (size % 2)
  }
  if (format !== 1 || bits !== 16 || ![1, 2].includes(channels) || !sampleRate || dataStart < 0) {
    throw new Error('صيغة WAV غير مدعومة؛ المطلوب PCM16 بقناة أو قناتين.')
  }
  const frames = Math.floor(dataSize / (2 * channels))
  const mono = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += wav.readInt16LE(dataStart + (i * channels + c) * 2) / 32768
    mono[i] = sum / channels
  }
  const outFrames = Math.floor(frames * 16000 / sampleRate)
  const pcm = Buffer.alloc(outFrames * 2)
  for (let i = 0; i < outFrames; i++) {
    const position = i * sampleRate / 16000
    const left = Math.min(frames - 1, Math.floor(position))
    const right = Math.min(frames - 1, left + 1)
    const fraction = position - left
    const sample = mono[left] * (1 - fraction) + mono[right] * fraction
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), i * 2)
  }
  return pcm
}

function findTimestampFields(value: any, found: any[] = [], depth = 0): any[] {
  if (!value || typeof value !== 'object' || depth > 12 || found.length >= 100) return found
  if (Array.isArray(value)) {
    for (const item of value) findTimestampFields(item, found, depth + 1)
    return found
  }
  const keys = Object.keys(value)
  if (keys.some(key => /word|start|end|offset|timestamp|time/i.test(key))) {
    found.push(value)
  }
  for (const item of Object.values(value)) findTimestampFields(item, found, depth + 1)
  return found
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY غير موجود في إعدادات Vercel.' }, { status: 500 })

  const url = new URL(request.url)
  const deckId = url.searchParams.get('deckId')?.trim()
  const cardId = url.searchParams.get('cardId')?.trim()
  if (!deckId || !cardId || deckId.length > 160 || cardId.length > 160) {
    return NextResponse.json({ error: 'أرسل deckId و cardId صالحين.' }, { status: 400 })
  }

  const client = db()
  const { data: asset, error } = await client.from('card_audio_assets')
    .select('audio_path,status').eq('deck_id', deckId).eq('card_id', cardId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!asset?.audio_path) return NextResponse.json({ error: 'لا يوجد ملف صوت محفوظ لهذا الكارد.' }, { status: 404 })

  try {
    const { data: file, error: downloadError } = await client.storage.from('card-audio').download(asset.audio_path)
    if (downloadError || !file) throw new Error(downloadError?.message || 'تعذر تنزيل الصوت المحفوظ.')
    const pcm = toPcm16k(Buffer.from(await file.arrayBuffer()))
    if (!pcm.length || pcm.length > 20 * 1024 * 1024) throw new Error('حجم الصوت غير مناسب لاختبار Live API.')

    const endpoint = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + encodeURIComponent(apiKey)
    const socket = new WebSocket(endpoint)
    const messages: any[] = []
    let setupReady = false
    let settled = false
    let audioSent = false
    let transcript = ''
    const finish = (resolve: (value: any) => void, reject: (error: Error) => void, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try { socket.close() } catch {}
      if (error) reject(error)
      else {
        const timestampCandidates = findTimestampFields(messages)
        resolve({
          model: 'gemini-3.8-live',
          requestedConfig: { inputAudioTranscription: { wordTimestamp: true } },
          transcript,
          timestampCandidateCount: timestampCandidates.length,
          timestampCandidates: timestampCandidates.slice(0, 30),
          messageShapes: messages.map(item => ({
            keys: Object.keys(item ?? {}),
            serverContentKeys: Object.keys(item?.serverContent ?? {}),
            inputTranscription: item?.serverContent?.inputTranscription ?? null,
            inputAudioTranscription: item?.serverContent?.inputAudioTranscription ?? null,
          })),
          savedToDatabase: false,
          note: timestampCandidates.length
            ? 'تم العثور على حقول مرشحة للتوقيت؛ يلزم التحقق من أنها توقيتات كلمات فعلية قبل اعتمادها.'
            : 'لم تظهر حقول توقيت كلمات في استجابة Live API؛ لم يتم حفظ أي توقيتات.',
        })
      }
    }
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(resolve, reject, new Error('انتهت مهلة اختبار Gemini Live.')), 45000)
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          setup: {
            model: 'models/gemini-3.8-live',
            generationConfig: { responseModalities: ['TEXT'] },
            inputAudioTranscription: { wordTimestamp: true },
          },
        }))
      })
      socket.addEventListener('message', async event => {
        try {
          const payload = event.data
          const raw = typeof payload === 'string' ? payload
            : Buffer.isBuffer(payload) ? payload.toString('utf8')
            : payload instanceof ArrayBuffer ? Buffer.from(payload).toString('utf8')
            : ArrayBuffer.isView(payload) ? Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString('utf8')
            : payload && typeof (payload as Blob).text === 'function' ? await (payload as Blob).text()
            : ''
          if (!raw) throw new Error('استجابة Live API فارغة أو غير مدعومة.')
          const message = JSON.parse(raw)
          if (message.error) throw new Error(message.error.message || 'Gemini Live returned an error.')
          if (messages.length < 80) messages.push(message)
          if (message.setupComplete && !setupReady) {
            setupReady = true
            const chunkBytes = 3200
            for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
              const chunk = pcm.subarray(offset, Math.min(pcm.length, offset + chunkBytes))
              socket.send(JSON.stringify({
                realtimeInput: {
                  audio: { mimeType: 'audio/pcm;rate=16000', data: chunk.toString('base64') },
                },
              }))
            }
            socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
            audioSent = true
            return
          }
          const input = message.serverContent?.inputTranscription
            ?? message.serverContent?.inputAudioTranscription
          if (typeof input?.text === 'string') transcript += input.text
          const status = message.interactionStatus ?? message.interaction_status
            ?? message.serverContent?.interactionStatus ?? message.serverContent?.interaction_status
          if (audioSent && (message.serverContent?.turnComplete || status === 'IDLE')) {
            finish(resolve, reject)
          }
        } catch (error) {
          finish(resolve, reject, error instanceof Error ? error : new Error('تعذر تحليل استجابة Gemini Live.'))
        }
      })
      socket.addEventListener('error', () => finish(resolve, reject, new Error('تعذر الاتصال بـ Gemini Live.')))
      socket.addEventListener('close', event => {
        if (!settled && event.code !== 1000) finish(resolve, reject, new Error('اتصال Gemini Live اتقفل (code ' + event.code + ').'))
      })
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'فشل اختبار Live API.' }, { status: 502 })
  }
}
