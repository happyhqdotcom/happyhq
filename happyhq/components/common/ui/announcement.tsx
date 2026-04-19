import { Badge, type BadgeProps } from '@/components/common/ui/badge'
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

export type AnnouncementProps = BadgeProps & {
  themed?: boolean
}

export const Announcement = ({
  variant = 'outline',
  themed = false,
  className,
  ...props
}: AnnouncementProps) => (
  <Badge
    variant={variant}
    className={cn(
      'group bg-background max-w-full gap-2 rounded-full py-0.5 pr-1 font-medium shadow-sm transition-all',
      'hover:shadow-sm',
      themed && 'announcement-themed border-foreground/5',
      className,
    )}
    {...props}
  />
)

export type AnnouncementTagProps = HTMLAttributes<HTMLDivElement>

export const AnnouncementTag = ({
  className,
  ...props
}: AnnouncementTagProps) => (
  <div
    className={cn(
      'bg-foreground/5 -ml-2 shrink-0 truncate rounded-full px-2 py-0.5 text-xs',
      'group-[.announcement-themed]:bg-background/60',
      className,
    )}
    {...props}
  />
)

export type AnnouncementTitleProps = HTMLAttributes<HTMLDivElement>

export const AnnouncementTitle = ({
  className,
  ...props
}: AnnouncementTitleProps) => (
  <div
    className={cn('flex w-full items-center gap-2 truncate py-1', className)}
    {...props}
  />
)
