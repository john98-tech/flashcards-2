'use client'

import { useState } from 'react'
import { Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listRecycleBin, permanentlyDeleteRecycleBinItem, restoreRecycleBinItem, type RecycleBinItem } from '@/app/admin/actions'

export function RecycleBinPanel() {
  const [items, setItems] = useState<RecycleBinItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const refresh = async () => {
    setError('')
    try { setItems(await listRecycleBin()); setLoaded(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل سلة المحذوفات.') }
  }
  const restore = async (id: string) => {
    setBusyId(id); setError('')
    try { await restoreRecycleBinItem(id); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذرت استعادة العنصر.') }
    finally { setBusyId('') }
  }
  const remove = async (id: string) => {
    if (!confirm('حذف نهائي؟ لن يمكن استعادة العنصر بعد ذلك.')) return
    setBusyId(id); setError('')
    try { await permanentlyDeleteRecycleBinItem(id); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر الحذف النهائي.') }
    finally { setBusyId('') }
  }
  return <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">سلة المحذوفات</h2><p className="text-sm text-muted-foreground">العناصر المحذوفة تُحفظ في قاعدة البيانات ويمكن استعادتها.</p></div>
      <Button variant="outline" onClick={refresh}>تحديث السلة</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!loaded ? <p className="text-sm text-muted-foreground">اضغط «تحديث السلة» لعرض العناصر المحذوفة.</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">سلة المحذوفات فارغة.</p> :
      <div className="flex flex-col gap-2">{items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0"><p className="font-medium">{item.entityType === 'deck' ? 'Deck / درس' : item.entityType === 'card' ? 'بطاقة' : item.entityType}</p><p className="break-all text-xs text-muted-foreground">{item.entityId} · {new Date(item.deletedAt).toLocaleString()}</p></div>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!!busyId} onClick={() => restore(item.id)}><RotateCcw className="size-4" /> استعادة</Button><Button size="sm" variant="destructive" disabled={!!busyId} onClick={() => remove(item.id)}>{busyId === item.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} حذف نهائي</Button></div>
      </div>)}</div>}
  </section>
}
