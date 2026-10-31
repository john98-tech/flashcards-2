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

function readPcmWav(wav: Buffer) {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('أحد ملفات الكروت ليس WAV صالحًا.')
  }
  let format = 0
  let channels = 0
  let sampleRate = 0
  let bits = 0
  let pcm: Buffer | null = null
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size > wav.length) throw new Error('ملف WAV لأحد الكروت غير مكتمل.')
    if (id === 'fmt ' && size >= 16) {
      format = wav.readUInt16LE(start)
      channels = wav.readUInt16LE(start + 2)
      sampleRate = wav.readUInt32LE(start + 4)
      bits = wav.readUInt16LE(start + 14)
    }
    if (id === 'data') {
      pcm = wav.subarray(start, start + size)
      break
    }
    offset = start + size + (size % 2)
  }
  if (format !== 1 || channels !== 1 || bits !== 16 || !sampleRate || !pcm) {
    throw new Error('صيغة أحد ملفات الصوت غير متوافقة؛ المطلوب WAV PCM أحادي القناة 16-bit.')
  }
  return { pcm, sampleRate }
}

function makeWav(pcm: Buffer, sampleRate: number) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })

  const body = await request.json().catch(() => null) as { deckId?: string; cardIds?: string[] } | null
  const deckId = body?.deckId?.trim()
  const cardIds = Array.isArray(body?.cardIds) ? body.cardIds : []
  if (!deckId || deckId.length > 160 || !cardIds.length || cardIds.length > 500 ||
      cardIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 160) ||
      new Set(cardIds).size !== cardIds.length) {
    return NextResponse.json({ error: 'بيانات الديك أو ترتيب الكروت غير صحيحة.' }, { status: 400 })
  }

  const client = db()
  const pieces: Buffer[] = []
  let sampleRate = 0
  let totalBytes = 0
  const silenceMs = 900
  let completedCards = 0

  for (const cardId of cardIds) {
    const [{ data: card, error: cardError }, { data: asset, error: assetError }] = await Promise.all([
      client.from('cards').select('cloze').eq('deck_id', deckId).eq('id', cardId).maybeSingle(),
      client.from('card_audio_assets').select('audio_path,source_hash').eq('deck_id', deckId).eq('card_id', cardId).maybeSingle(),
    ])
    if (cardError || assetError) return NextResponse.json({ error: cardError?.message || assetError?.message || 'تعذر قراءة بيانات الكارد.' }, { status: 500 })
    if (!card || !asset) return NextResponse.json({ error: 'صوت الكارد رقم ' + (completedCards + 1) + ' غير جاهز. جهّز صوت الديك كله أولًا.' }, { status: 409 })
    const expectedHash = createHash('sha256').update(spokenText(card.cloze)).digest('hex')
    if (asset.source_hash !== expectedHash) return NextResponse.json({ error: 'نص الكارد رقم ' + (completedCards + 1) + ' اتغير بعد إنشاء الصوت؛ أعد تجهيز صوت الديك.' }, { status: 409 })

    const { data: file, error: downloadError } = await client.storage.from('card-audio').download(asset.audio_path)
    if (downloadError || !file) return NextResponse.json({ error: 'تعذر تحميل صوت الكارد رقم ' + (completedCards + 1) + '.' }, { status: 500 })
    const parsed = readPcmWav(Buffer.from(await file.arrayBuffer()))
    if (!sampleRate) sampleRate = parsed.sampleRate
    if (parsed.sampleRate !== sampleRate) return NextResponse.json({ error: 'معدل الصوت مختلف بين الكروت؛ لا يمكن دمجها في ملف واحد.' }, { status: 409 })

    if (completedCards > 0) {
      const silence = Buffer.alloc(Math.round(sampleRate * silenceMs / 1000) * 2)
      pieces.push(silence)
      totalBytes += silence.length
    }
    pieces.push(parsed.pcm)
    totalBytes += parsed.pcm.length
    completedCards++
    if (totalBytes > 45 * 1024 * 1024) {
      return NextResponse.json({ error: 'حجم صوت الديك أكبر من الحد الآمن للتجميع. قسّم الديك إلى جزأين.' }, { status: 413 })
    }
  }

  const output = makeWav(Buffer.concat(pieces, totalBytes), sampleRate)
  return new Response(new Uint8Array(output), {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(output.length),
      'Content-Disposition': 'attachment; filename="deck-full-audio.wav"',
      'Cache-Control': 'no-store',
      'X-Deck-Card-Count': String(completedCards),
      'X-Deck-Separator-Ms': String(silenceMs),
    },
  })
}
