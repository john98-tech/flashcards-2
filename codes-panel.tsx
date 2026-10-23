'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Ban, Check, Copy, Download, KeyRound, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DeckSummary } from '@/lib/decks'
import { deleteCode, generateCodes, listCodes, setCodeRevoked, type AccessCode } from '@/app/admin/actions'

type Filter = 'all' | 'unused' | 'redeemed' | 'revoked'

const statusOf = (c: AccessCode): Exclude<Filter, 'all'> =>
  c.revoked ? 'revoked' : c.redeemedAt ? 'redeemed' : 'unused'

export function CodesPanel({ decks }: { decks: DeckSummary[] }) {
  const { data: codes = [], mutate, isLoading } = useSWR('admin-codes', () => listCodes())
  const paidDecks = decks.filter((d) => !d.isFree)
  const titles = useMemo(() => new Map(decks.map((d) => [d.id, d.title])), [decks])

  const [count, setCount] = useState(10)
  const [label, setLabel] = useState('')
  const [allPaid, setAllPaid] = useState(true)
  const [deckIds, setDeckIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fresh, setFresh] = useState<string[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [copied, setCopied] = useState<string | null>(null)

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const created = await generateCodes({ count, label, allPaid, deckIds })
      setFresh(created)
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate codes.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const downloadCsv = (rows: AccessCode[]) => {
    const csv = [
      'code,label,unlocks,status,created_at,redeemed_at',
      ...rows.map((c) =>
        [c.code, c.label, scopeText(c), statusOf(c), c.createdAt, c.redeemedAt ?? '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'access-codes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const scopeText = (c: AccessCode) =>
    c.allPaid ? 'All paid decks' : c.deckIds.map((id) => titles.get(id) ?? id).join(', ')

  const visible = filter === 'all' ? codes : codes.filter((c) => statusOf(c) === filter)
  const counts = useMemo(() => {
    const result = { all: codes.length, unused: 0, redeemed: 0, revoked: 0 }
    for (const c of codes) result[statusOf(c)]++
    return result
  }, [codes])

  const toggleDeck = (id: string) =>
    setDeckIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <div>
          <h2 className="font-semibold">Generate access codes</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each code works for one user only: it locks to the first device that redeems it. Free decks are open
            to everyone; codes unlock paid decks.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            How many
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Label (optional, e.g. student name or batch)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="October batch"
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">What the code unlocks</legend>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" checked={allPaid} onChange={() => setAllPaid(true)} className="accent-primary" />
            All paid decks (including ones added later)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" checked={!allPaid} onChange={() => setAllPaid(false)} className="accent-primary" />
            Specific decks only
          </label>
          {!allPaid && (
            <div className="ml-6 flex flex-col gap-1.5">
              {paidDecks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No paid decks yet. Mark a deck as Paid in the Decks tab first.
                </p>
              ) : (
                paidDecks.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={deckIds.includes(d.id)}
                      onChange={() => toggleDeck(d.id)}
                      className="size-4 accent-primary"
                    />
                    <span dir="auto">{d.title}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button className="w-fit" onClick={generate} disabled={busy || count < 1}>
          <KeyRound aria-hidden /> {busy ? 'Generating…' : `Generate ${count || ''} code${count === 1 ? '' : 's'}`}
        </Button>

        {fresh.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-success">{fresh.length} new codes created</span>
              <Button variant="outline" size="xs" onClick={() => copy(fresh.join('\n'), 'fresh')}>
                {copied === 'fresh' ? <Check aria-hidden /> : <Copy aria-hidden />} Copy all
              </Button>
            </div>
            <p className="font-mono text-sm leading-relaxed break-all">{fresh.join('  ')}</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1" role="group" aria-label="Filter codes">
            {(['all', 'unused', 'redeemed', 'revoked'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs capitalize transition-colors',
                  filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f} ({counts[f]})
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(visible)} disabled={!visible.length}>
            <Download aria-hidden /> Export CSV
          </Button>
        </div>

        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading codes…</p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No codes here yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">Unlocks</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const status = statusOf(c)
                  return (
                    <tr key={c.code} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{c.code}</td>
                      <td className="px-3 py-2" dir="auto">
                        {c.label || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" dir="auto">
                        {scopeText(c)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-medium',
                            status === 'unused' && 'bg-accent text-accent-foreground',
                            status === 'redeemed' && 'bg-success/15 text-success',
                            status === 'revoked' && 'bg-destructive/10 text-destructive',
                          )}
                        >
                          {status === 'redeemed'
                            ? `Used ${new Date(c.redeemedAt!).toLocaleDateString('en-GB')}`
                            : status === 'unused'
                              ? 'Unused'
                              : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-xs" aria-label="Copy code" onClick={() => copy(c.code, c.code)}>
                            {copied === c.code ? <Check aria-hidden /> : <Copy aria-hidden />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={c.revoked ? 'Restore code' : 'Revoke code'}
                            onClick={async () => {
                              await setCodeRevoked(c.code, !c.revoked)
                              mutate()
                            }}
                          >
                            {c.revoked ? <RotateCcw aria-hidden /> : <Ban aria-hidden />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Delete code"
                            onClick={async () => {
                              if (!confirm(`Delete code ${c.code}? Whoever redeemed it loses access.`)) return
                              await deleteCode(c.code)
                              mutate()
                            }}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
