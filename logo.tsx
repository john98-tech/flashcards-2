import Image from 'next/image'
import { cn } from '@/lib/utils'

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      priority
      className={cn('rounded-[28%] shadow-sm', className)}
    />
  )
}
