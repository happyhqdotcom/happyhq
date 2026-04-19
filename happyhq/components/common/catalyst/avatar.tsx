import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { Home, type LucideIcon } from 'lucide-react'
import Image from 'next/image'
import React, { forwardRef } from 'react'
import { TouchTarget } from './button'
import { Link } from './link'

// Minimal icon map for avatar fallbacks
const ICON_MAP: Record<string, LucideIcon> = {
  default: Home,
}

type AvatarProps = {
  src?: string | null
  square?: boolean
  initials?: string
  alt?: string
  icon?: string
  iconColor?: string
  className?: string
  iconSize?: string
  avatarDimensions?: number
}

export function Avatar({
  src = null,
  square = false,
  initials,
  alt = '',
  icon = 'default', // Default to Home icon
  iconColor = 'text-white',
  className,
  iconSize = 'size-4',
  avatarDimensions = 32,
  ...props
}: AvatarProps & React.ComponentPropsWithoutRef<'span'>) {
  // Determine if the src is a valid image URL
  const isValidImage = src?.startsWith('http')
  const IconComponent = ICON_MAP[icon] || ICON_MAP['default']

  return (
    <span
      data-slot="avatar"
      {...props}
      className={clsx(
        className,
        'inline-grid shrink-0 items-center justify-center align-middle [--avatar-radius:20%] [--ring-opacity:20%] *:col-start-1 *:row-start-1',
        'outline -outline-offset-1 outline-black/(--ring-opacity) dark:outline-white/(--ring-opacity)',
        square
          ? 'rounded-(--avatar-radius) *:rounded-(--avatar-radius)'
          : 'rounded-full *:rounded-full',
      )}
    >
      {/* Show initials if provided */}
      {initials && !isValidImage && (
        <svg
          className="size-full fill-current p-[5%] text-[48px] font-medium uppercase select-none"
          viewBox="0 0 100 100"
          aria-hidden={alt ? undefined : 'true'}
        >
          {alt && <title>{alt}</title>}
          <text
            x="50%"
            y="50%"
            alignmentBaseline="middle"
            dominantBaseline="middle"
            textAnchor="middle"
            dy=".125em"
          >
            {initials}
          </text>
        </svg>
      )}

      {/* Render image if valid */}
      {isValidImage && (
        <Image
          className="size-full rounded-md object-cover"
          src={src ?? ''}
          alt={alt}
          width={avatarDimensions}
          height={avatarDimensions}
          // Small avatars (≤32px) likely appear above-the-fold, prioritize their loading
          priority={avatarDimensions <= 32}
        />
      )}

      {/* Render fallback icon if no initials or valid image */}
      {!initials && !isValidImage && (
        <IconComponent className={`${iconSize} ${iconColor}`} />
      )}
    </span>
  )
}

export const AvatarButton = forwardRef(function AvatarButton(
  {
    src,
    square = false,
    initials,
    alt,
    icon,
    className,
    ...props
  }: AvatarProps &
    (
      | Omit<Headless.ButtonProps, 'as' | 'className'>
      | Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>
    ),
  ref: React.ForwardedRef<HTMLElement>,
) {
  const classes = clsx(
    className,
    square ? 'rounded-[20%]' : 'rounded-full',
    'relative inline-grid focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500',
  )

  return 'href' in props ? (
    <Link
      {...props}
      className={classes}
      ref={ref as React.ForwardedRef<HTMLAnchorElement>}
    >
      <TouchTarget>
        <Avatar
          src={src}
          square={square}
          initials={initials}
          alt={alt}
          icon={icon}
        />
      </TouchTarget>
    </Link>
  ) : (
    <Headless.Button {...props} className={classes} ref={ref}>
      <TouchTarget>
        <Avatar
          src={src}
          square={square}
          initials={initials}
          alt={alt}
          icon={icon}
        />
      </TouchTarget>
    </Headless.Button>
  )
})
