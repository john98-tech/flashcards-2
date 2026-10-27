'use client'

import { memo, useMemo } from 'react'
import { GripVertical, Merge, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fromCloze, toCloze, type Card } from '@/lib/cloze'
import { renderRichInline } from '@/components/rich-inline'

type Props = {
  card: Card
  number: number
  index: number
  selected?: boolean
  dragging?: boolean
  dropLine?: 'before' | 'after' | null
  onChange: (id: string, cloze: string) => void
  onDelete: (id: string) => void
  onMergeNext?: (id: string) => void
  onPick?: (id: string, e: React.MouseEvent) => void
  onMenu?: (id: string, e: React.MouseEvent) => void
  onDragStart?: (id: string, e: React.DragEvent) => void
  onDragOverCard?: (index: number, e: React.DragEvent) => void
  onDragEnd?: () => void
}

export const CardEditor = memo(function CardEditor({
  card,
  number,
  index,
  selected,
  dragging,
  dropLine,
  onChange,
  onDelete,
  onMergeNext,
  onPick,
  onMenu,
  onDragStart,
  onDragOverCard,
  onDragEnd,
}: Props) {
  const { text, tokens, selected: chosen } = useMemo(() => fromCloze(card.cloze), [card.cloze])
  const blanks = useMemo(() => (card.cloze.match(/\{\{/g) ?? []).length, [card.cloze])

  const toggle = (i: number) => {
    const next = new Set(chosen)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onChange(card.id, toCloze(text, tokens, next))
  }

  return (
    <li
      data-card-id={card.id}
      draggable
      onDragStart={(e) => onDragStart?.(card.id, e)}
      onDragOver={(e) => onDragOverCard?.(index, e)}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        onPick?.(card.id, e)
      }}
      onContextMenu={(e) => onMenu?.(card.id, e)}
      className={cn(
        'relative select-none rounded-xl border bg-card p-4 transition-[box-shadow,opacity,background-color]',
        blanks === 0 && 'border-destructive/50',
        selected && 'border-primary bg-primary/5 ring-2 ring-primary/40',
        dragging && 'opacity-40',
      )}
    >
      {dropLine && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-2 h-1 rounded-full bg-primary shadow-lg shadow-primary/50',
            dropLine === 'before' ? '-top-2' : '-bottom-2',
          )}
        />
      )}
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <GripVertical className="size-3.5" aria-hidden />#{number} ·{' '}
          <span className={cn(blanks === 0 && 'font-semibold text-destructive')}>{blanks} فراغ</span>
        </span>
        <div className="flex items-center gap-1">
          {onMergeNext && (
            <Button variant="ghost" size="xs" onClick={() => onMergeNext(card.id)}>
              <Merge aria-hidden /> ادمج مع اللي بعده
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" aria-label="امسح الكارت" onClick={() => onDelete(card.id)}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {(() => {
        const lines: { value: string; start: number; end: number }[] = []
        let offset = 0
        for (const value of text.split('\n')) {
          lines.push({ value, start: offset, end: offset + value.length })
          offset += value.length + 1
        }
        const isTableRow = (value: string) => /^\s*\|.*\|\s*$/.test(value)
        const isDivider = (value: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(value)
        const renderPlainRange = (start: number, end: number) => tokens.map((t, i) => {
          if (t.start < start || t.end > end) return null
          if (t.space) {
            const joined = chosen.has(i - 1) && chosen.has(i + 1)
            return <span key={i} className={cn(joined && 'bg-highlight')}>{t.text}</span>
          }
          const on = chosen.has(i)
          return <button key={i} type="button" aria-pressed={on} onClick={() => toggle(i)} className={cn('rounded-sm transition-colors', on ? 'bg-highlight font-semibold text-highlight-foreground' : 'hover:bg-accent')}>{t.text}</button>
        })
        const renderRange = (start: number, end: number) => renderRichInline(text, start, end, renderPlainRange, `admin-${start}-${end}`)
        const blocks: { type: 'line' | 'table' | 'diagram'; lines: typeof lines }[] = []
        for (let i = 0; i < lines.length;) {
          if (i + 1 < lines.length && isTableRow(lines[i].value) && isDivider(lines[i + 1].value)) {
            const rows = [lines[i], lines[i + 1]]
            i += 2
            while (i < lines.length && isTableRow(lines[i].value)) rows.push(lines[i++])
            blocks.push({ type: 'table', lines: rows.filter((line, index) => index !== 1) })
          } else if (/^\s*[│├└┌┐┘┬┴─┼]/.test(lines[i].value)) {
            const rows = [lines[i++]]
            while (i < lines.length && /^\s*[│├└┌┐┘┬┴─┼]/.test(lines[i].value)) rows.push(lines[i++])
            blocks.push({ type: 'diagram', lines: rows })
          } else {
            blocks.push({ type: 'line', lines: [lines[i++]] })
          }
        }
        return <div dir="auto" className="space-y-2 leading-loose">
          {blocks.map((block, bi) => block.type === 'table' ? (
            <div key={bi} className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <tbody>{block.lines.map((line, ri) => {
                  const cells = line.value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
                  let cursor = line.start + line.value.indexOf(line.value.trim().replace(/^\|/, '').split('|')[0])
                  return <tr key={ri} className={ri === 0 ? 'bg-muted/70 font-semibold' : 'border-t'}>
                    {cells.map((cell, ci) => {
                      const at = line.value.indexOf(cell, Math.max(0, cursor - line.start))
                      const start = line.start + (at >= 0 ? at : 0)
                      cursor = start + cell.length + 1
                      return <td key={ci} className="border-e px-3 py-2 align-top last:border-e-0">{renderRange(start, start + cell.length)}</td>
                    })}
                  </tr>
                })}</tbody>
              </table>
            </div>
          ) : block.type === 'diagram' ? (
            <pre key={bi} className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">{block.lines.map((line, i) => <span key={i}>{renderRange(line.start, line.end)}{i < block.lines.length - 1 ? '\n' : ''}</span>)}</pre>
          ) : <div key={bi} className="whitespace-pre-wrap">{renderRange(block.lines[0].start, block.lines[0].end)}</div>)}
        </div>
      })()}
    </li>
  )
})
