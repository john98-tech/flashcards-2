import Link from 'next/link'
import { Layers, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Top-level split of the site into its two independent study modes. */
export function SectionSwitcher({ active }: { active: 'cards' | 'recite' }) {
  const items = [
    { id: 'cards', href: '/', icon: Layers, title: 'فلاش كاردز', body: 'كروت فيها جمل الكتاب بكلمات مفرّغة. افتحها واحفظ كلمة كلمة.' },
    { id: 'recite', href: '/recite', icon: PenLine, title: 'تسميع بالكتابة', body: 'صفحة بيضا بالكيبورد أو القلم، وGemini يصحّح لك الغلط والإملاء والنواقص.' },
  ] as const
  return (
    <nav aria-label="أقسام الموقع" className="mb-8 grid gap-3 sm:grid-cols-2" dir="rtl">
      {items.map(({ id, href, icon: Icon, title, body }) => (
        <Link
          key={id}
          href={href}
          aria-current={active === id ? 'page' : undefined}
          className={cn(
            'flex items-start gap-3 rounded-2xl border p-4 transition-all',
            active === id ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' : 'bg-card hover:-translate-y-0.5 hover:border-primary/50',
          )}
        >
          <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', active === id ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground')}>
            <Icon className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block text-lg font-bold">{title}</span>
            <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{body}</span>
          </span>
        </Link>
      ))}
    </nav>
  )
}
