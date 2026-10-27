'use client'

import type { CSSProperties, ReactNode } from 'react'

type Match = { start: number; end: number; innerStart: number; innerEnd: number; kind: 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'style'; style?: CSSProperties }

function parseInlineStyle(raw: string): CSSProperties {
  const result: CSSProperties = {}
  for (const declaration of raw.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator < 0) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if (!value || /[<>]/.test(value)) continue
    if (property === 'color') result.color = value
    else if (property === 'background-color') result.backgroundColor = value
    else if (property === 'font-size' && /^(\\d+(?:\\.\\d+)?(px|pt|em|rem|%))$/i.test(value)) result.fontSize = value
    else if (property === 'font-family') result.fontFamily = value.replace(/["']/g, '')
  }
  return result
}

function firstMarkup(text: string, start: number, end: number): Match | null {
  const slice = text.slice(start, end)
  const patterns: { regex: RegExp; kind: Match['kind']; colorGroup?: number; innerGroup: number }[] = [
    { regex: /<span\s+style=["']color\s*:\s*(#[\da-f]{3,8}|[a-z]+)["']\s*>([\s\S]*?)<\/span>/i, kind: 'color', colorGroup: 1, innerGroup: 2 },
    { regex: /\*\*([\s\S]+?)\*\*/, kind: 'bold', innerGroup: 1 },
    { regex: /~~([\s\S]+?)~~/, kind: 'strike', innerGroup: 1 },
    { regex: /<u>([\s\S]+?)<\/u>/i, kind: 'underline', innerGroup: 1 },
    { regex: /==([\s\S]+?)==/, kind: 'highlight', innerGroup: 1 },
    { regex: /(?<!\*)\*([^*\n]+)\*(?!\*)/, kind: 'italic', innerGroup: 1 },
  ]
  let best: Match | null = null
  for (const pattern of patterns) {
    const found = pattern.regex.exec(slice)
    if (!found || found.index === undefined) continue
    const candidate: Match = {
      start: start + found.index,
      end: start + found.index + found[0].length,
      innerStart: start + found.index + found[0].indexOf(found[pattern.innerGroup]),
      innerEnd: start + found.index + found[0].indexOf(found[pattern.innerGroup]) + found[pattern.innerGroup].length,
      kind: pattern.kind,
      style: pattern.colorGroup ? parseInlineStyle(found[pattern.colorGroup]) : undefined,
    }
    if (!best || candidate.start < best.start || (candidate.start === best.start && candidate.end > best.end)) best = candidate
  }
  return best
}

/** Render the formatting markers emitted by the rich-text editor while leaving the underlying word ranges intact. */
export function renderRichInline(
  text: string,
  start: number,
  end: number,
  renderPlain: (start: number, end: number) => ReactNode,
  keyPrefix = 'rich',
): ReactNode {
  const match = firstMarkup(text, start, end)
  if (!match) return renderPlain(start, end)
  const before = match.start > start ? renderPlain(start, match.start) : null
  const inside = renderRichInline(text, match.innerStart, match.innerEnd, renderPlain, keyPrefix + '-in')
  const after = match.end < end ? renderRichInline(text, match.end, end, renderPlain, keyPrefix + '-after') : null
  let formatted: ReactNode
  switch (match.kind) {
    case 'bold': formatted = <strong>{inside}</strong>; break
    case 'italic': formatted = <em>{inside}</em>; break
    case 'underline': formatted = <u>{inside}</u>; break
    case 'strike': formatted = <s>{inside}</s>; break
    case 'highlight': formatted = <mark className="rounded px-0.5">{inside}</mark>; break
    case 'style': formatted = <span style={match.style}>{inside}</span>; break
  }
  return <>{before}{formatted}{after}</>
}
