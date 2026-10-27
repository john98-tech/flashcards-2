import { Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'

/** Per-block text direction (RTL / LTR), like the direction toggle in Samsung Notes. */
const BlockDirection = Extension.create({
  name: 'blockDirection',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('dir'),
            renderHTML: (attrs: Record<string, unknown>) => (attrs.dir ? { dir: attrs.dir as string } : {}),
          },
        },
      },
    ]
  },
})

export function createReciteExtensions() {
  return [
    StarterKit.configure({ link: { openOnClick: false } }),
    TextStyleKit,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    BlockDirection,
    Placeholder.configure({ placeholder: 'ابدأ اكتب كل اللي فاكره من الدرس هنا...' }),
  ]
}
