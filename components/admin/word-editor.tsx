'use client'

import { useEffect } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Placeholder from '@tiptap/extension-placeholder'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---- editor document -> plain text (tables become Markdown tables, as the card renderer expects) ----

function inlineText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(inlineText).join('')
}

function tableToText(table: JSONContent): string {
  const rows = (table.content ?? [])
    .map((row) =>
      (row.content ?? []).map((cell) =>
        (cell.content ?? []).map(inlineText).join(' ').replace(/\s+/g, ' ').replace(/\|/g, '/').trim()
      )
    )
    .filter((row) => row.some(Boolean))
  if (!rows.length) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''))
  const divider = Array.from({ length: width }, () => '---')
  return [normalized[0], divider, ...normalized.slice(1)].map((row) => '| ' + row.join(' | ') + ' |').join('\n')
}

function blockToText(node: JSONContent, prefix = ''): string[] {
  switch (node.type) {
    case 'table':
      return [tableToText(node)]
    case 'bulletList':
      return [(node.content ?? []).map((li) => blockToText(li, '• ').join('\n')).join('\n')]
    case 'orderedList':
      return [(node.content ?? []).map((li, i) => blockToText(li, `${i + 1}. `).join('\n')).join('\n')]
    case 'listItem': {
      const parts = (node.content ?? []).flatMap((child) => blockToText(child))
      return [prefix + parts.join('\n')]
    }
    case 'blockquote':
      return (node.content ?? []).flatMap((child) => blockToText(child))
    case 'horizontalRule':
      return []
    default:
      return [inlineText(node)]
  }
}

export function docToText(doc: JSONContent): string {
  return (doc.content ?? [])
    .flatMap((node) => blockToText(node))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n')
}

// ---- toolbar ----

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // keep the selection inside the editor while clicking toolbar buttons
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-accent disabled:opacity-40 [&_svg]:size-4',
        active && 'bg-accent text-foreground'
      )}
    >
      {children}
    </button>
  )
}

const Sep = () => <span aria-hidden className="mx-1 h-5 w-px bg-border" />

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      inTable: e.isActive('table'),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const run = () => editor.chain().focus()

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1.5" dir="ltr">
      <Btn title="تراجع" onClick={() => run().undo().run()} disabled={!s.canUndo}><Undo2 /></Btn>
      <Btn title="إعادة" onClick={() => run().redo().run()} disabled={!s.canRedo}><Redo2 /></Btn>
      <Sep />
      <Btn title="عنوان 1" active={s.h1} onClick={() => run().toggleHeading({ level: 1 }).run()}><Heading1 /></Btn>
      <Btn title="عنوان 2" active={s.h2} onClick={() => run().toggleHeading({ level: 2 }).run()}><Heading2 /></Btn>
      <Btn title="عنوان 3" active={s.h3} onClick={() => run().toggleHeading({ level: 3 }).run()}><Heading3 /></Btn>
      <Sep />
      <Btn title="عريض" active={s.bold} onClick={() => run().toggleBold().run()}><Bold /></Btn>
      <Btn title="مائل" active={s.italic} onClick={() => run().toggleItalic().run()}><Italic /></Btn>
      <Btn title="تحته خط" active={s.underline} onClick={() => run().toggleUnderline().run()}><UnderlineIcon /></Btn>
      <Btn title="يتوسطه خط" active={s.strike} onClick={() => run().toggleStrike().run()}><Strikethrough /></Btn>
      <Btn title="تمييز" active={s.highlight} onClick={() => run().toggleHighlight().run()}><Highlighter /></Btn>
      <label
        title="لون الخط"
        className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="text-sm font-bold leading-none" style={{ color: s.color || undefined }}>A</span>
        <span className="absolute bottom-1 h-0.5 w-4 rounded" style={{ background: s.color || 'currentColor' }} />
        <input
          type="color"
          aria-label="لون الخط"
          value={s.color || '#000000'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <Sep />
      <Btn title="محاذاة لليسار" active={s.left} onClick={() => run().setTextAlign('left').run()}><AlignLeft /></Btn>
      <Btn title="توسيط" active={s.center} onClick={() => run().setTextAlign('center').run()}><AlignCenter /></Btn>
      <Btn title="محاذاة لليمين" active={s.right} onClick={() => run().setTextAlign('right').run()}><AlignRight /></Btn>
      <Sep />
      <Btn title="قائمة نقطية" active={s.bullet} onClick={() => run().toggleBulletList().run()}><List /></Btn>
      <Btn title="قائمة مرقمة" active={s.ordered} onClick={() => run().toggleOrderedList().run()}><ListOrdered /></Btn>
      <Btn title="اقتباس" active={s.quote} onClick={() => run().toggleBlockquote().run()}><Quote /></Btn>
      <Sep />
      <Btn title="إدراج جدول" onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon /></Btn>
      {s.inTable && (
        <>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run().addRowAfter().run()} className="h-8 rounded-md px-2 text-xs hover:bg-accent">+ صف</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run().addColumnAfter().run()} className="h-8 rounded-md px-2 text-xs hover:bg-accent">+ عمود</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run().deleteRow().run()} className="h-8 rounded-md px-2 text-xs hover:bg-accent">− صف</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run().deleteColumn().run()} className="h-8 rounded-md px-2 text-xs hover:bg-accent">− عمود</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run().deleteTable().run()} className="h-8 rounded-md px-2 text-xs text-destructive hover:bg-accent">حذف الجدول</button>
        </>
      )}
      <Sep />
      <Btn title="مسح التنسيق" onClick={() => run().unsetAllMarks().clearNodes().run()}><Eraser /></Btn>
    </div>
  )
}

// ---- editor ----

type Props = {
  /** Called with the plain-text version (tables as Markdown) on every edit. */
  onTextChange: (text: string) => void
  /** Bump this number to clear the editor. */
  resetKey?: number
  placeholder?: string
  /** Plain text loaded into the editor when it mounts (blank lines separate paragraphs). */
  initialText?: string
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function WordEditor({ onTextChange, resetKey = 0, placeholder, initialText }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    content: initialText ? textToHtml(initialText) : undefined,
    extensions: [
      StarterKit,
      TableKit.configure({ table: { resizable: true } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    editorProps: {
      attributes: {
        id: 'source',
        dir: 'auto',
        class: 'word-editor-content min-h-56 p-4 text-sm leading-relaxed outline-none',
      },
    },
    onUpdate: ({ editor: e }) => onTextChange(docToText(e.getJSON())),
  })

  useEffect(() => {
    if (resetKey > 0 && editor) editor.commands.clearContent(true)
  }, [resetKey, editor])

  return (
    <div className="word-editor overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
