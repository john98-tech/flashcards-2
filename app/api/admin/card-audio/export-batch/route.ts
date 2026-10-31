import { NextResponse } from 'next/server'
import { deflateRawSync } from 'node:zlib'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type ZipEntry = { name: string; data: Buffer }

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeZip(entries: ZipEntry[]) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const compressed = deflateRawSync(entry.data)
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDirectory, end])
}

export async function GET() {
  const session = await getSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })
  }

  const client = db()
  const { data: assets, error } = await client
    .from('card_audio_assets')
    .select('deck_id,card_id,audio_path,mime_type,source_hash,status')
    .eq('status', 'needs_review')
    .not('audio_path', 'is', null)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'تعذر قراءة قائمة ملفات الصوت.' }, { status: 500 })
  }
  if (!assets?.length) {
    return NextResponse.json({ error: 'لا توجد ملفات صوت تحتاج مراجعة.' }, { status: 404 })
  }
  if (assets.length > 40) {
    return NextResponse.json({ error: 'عدد الملفات أكبر من حد التصدير الآمن. صدّر مجموعة أصغر.' }, { status: 413 })
  }

  const entries: ZipEntry[] = []
  const manifest: Array<Record<string, unknown>> = []
  let totalBytes = 0

  for (const asset of assets) {
    if (!asset.audio_path) continue
    const { data: card, error: cardError } = await client
      .from('cards')
      .select('cloze')
      .eq('id', asset.card_id)
      .eq('deck_id', asset.deck_id)
      .maybeSingle()

    if (cardError || !card) {
      return NextResponse.json({ error: 'تعذر قراءة نص أحد الكروت؛ لم يتم إنشاء ملف ناقص.' }, { status: 500 })
    }

    const { data: signed, error: signError } = await client.storage
      .from('card-audio')
      .createSignedUrl(asset.audio_path, 5 * 60)

    if (signError || !signed?.signedUrl) {
      return NextResponse.json({ error: 'تعذر تجهيز أحد ملفات الصوت؛ لم يتم إنشاء ملف ناقص.' }, { status: 500 })
    }

    const response = await fetch(signed.signedUrl, { cache: 'no-store' })
    if (!response.ok) {
      return NextResponse.json({ error: 'تعذر تنزيل أحد ملفات الصوت من التخزين.' }, { status: 502 })
    }

    const audio = Buffer.from(await response.arrayBuffer())
    totalBytes += audio.length
    if (totalBytes > 80 * 1024 * 1024) {
      return NextResponse.json({ error: 'حجم الملفات أكبر من حد التصدير الآمن (80 MB).' }, { status: 413 })
    }

    const safeDeck = String(asset.deck_id).replace(/[^a-zA-Z0-9_-]/g, '_')
    const safeCard = String(asset.card_id).replace(/[^a-zA-Z0-9_-]/g, '_')
    entries.push({ name: `audio/${safeDeck}/${safeCard}.wav`, data: audio })
    manifest.push({
      deckId: asset.deck_id,
      cardId: asset.card_id,
      file: `audio/${safeDeck}/${safeCard}.wav`,
      mimeType: asset.mime_type || 'audio/wav',
      sourceHash: asset.source_hash,
      status: asset.status,
      cloze: card.cloze || '',
    })
  }

  entries.push({
    name: 'manifest.json',
    data: Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), count: manifest.length, cards: manifest }, null, 2), 'utf8'),
  })

  const zip = makeZip(entries)
  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="card-audio-needs-review.zip"',
      'Content-Length': String(zip.length),
      'Cache-Control': 'no-store, private',
      'Pragma': 'no-cache',
    },
  })
}
