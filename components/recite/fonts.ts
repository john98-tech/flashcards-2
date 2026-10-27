import { Amiri, Cairo, Caveat, Tajawal } from 'next/font/google'

export const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' })
export const tajawal = Tajawal({ subsets: ['arabic', 'latin'], weight: ['400', '500', '700'], variable: '--font-tajawal', display: 'swap' })
export const amiri = Amiri({ subsets: ['arabic', 'latin'], weight: ['400', '700'], variable: '--font-amiri', display: 'swap' })
export const caveat = Caveat({ subsets: ['latin'], variable: '--font-caveat', display: 'swap' })

export const reciteFontVars = [cairo, tajawal, amiri, caveat].map((f) => f.variable).join(' ')

export const FONT_FAMILIES: { label: string; value: string | null }[] = [
  { label: 'الافتراضي', value: null },
  { label: 'Cairo', value: 'var(--font-cairo), sans-serif' },
  { label: 'Tajawal', value: 'var(--font-tajawal), sans-serif' },
  { label: 'Amiri', value: 'var(--font-amiri), serif' },
  { label: 'Caveat', value: 'var(--font-caveat), cursive' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
]

export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64]
export const DEFAULT_FONT_SIZE = 18

export const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#9900ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#d9d2e9',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#8e7cc3',
  '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#674ea7',
  '#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#20124d',
]

export const HIGHLIGHT_COLORS = ['#fff176', '#b9f6ca', '#80deea', '#f8bbd0', '#ffcc80', '#d1c4e9', '#ef9a9a', '#e0e0e0']
export const LINE_HEIGHTS = ['1.2', '1.5', '1.9', '2.4', '3']
