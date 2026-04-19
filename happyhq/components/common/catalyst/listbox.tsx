'use client'

import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { ChevronDownIcon } from 'lucide-react'
import { Fragment } from 'react'

export function Listbox<T>({
  className,
  placeholder,
  autoFocus,
  compact,
  ghost,
  anchor,
  'aria-label': ariaLabel,
  children: options,
  ...props
}: {
  className?: string
  placeholder?: React.ReactNode
  autoFocus?: boolean
  compact?: boolean
  /** Ghost: no background, just text + chevron. Implies compact. */
  ghost?: boolean
  /** Override anchor positioning for the options panel. */
  anchor?: Headless.ListboxOptionsProps['anchor']
  'aria-label'?: string
  children?: React.ReactNode
} & Omit<Headless.ListboxProps<typeof Fragment, T>, 'as' | 'multiple'>) {
  if (ghost) compact = true
  return (
    <Headless.Listbox {...props} multiple={false}>
      <Headless.ListboxButton
        autoFocus={autoFocus}
        data-slot="control"
        aria-label={ariaLabel}
        className={clsx([
          className,
          // Basic layout
          'group relative block',
          !compact && 'w-full',
          // Hide default focus styles
          'focus:outline-hidden',
          // Disabled state
          'data-disabled:opacity-50',
          compact
            ? // Compact: muted background, no pseudo-elements
              'rounded-lg'
            : [
                // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
                'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm',
                // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
                'dark:before:hidden',
                // Focus ring
                'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset data-focus:after:ring-2 data-focus:after:ring-blue-500',
                // Disabled state (extended)
                'data-disabled:before:bg-zinc-950/5 data-disabled:before:shadow-none',
              ],
        ])}
      >
        <Headless.ListboxSelectedOption
          as="span"
          options={options}
          placeholder={
            placeholder && (
              <span className="block truncate text-zinc-500">
                {placeholder}
              </span>
            )
          }
          className={clsx([
            // Basic layout
            'relative block appearance-none rounded-lg',
            !compact && 'w-full',
            // Background color
            'bg-transparent',
            compact
              ? [
                  // Compact: muted pill with chevron-down
                  'rounded-lg py-1 pr-7',
                  'pl-3',
                  ghost
                    ? 'bg-transparent hover:bg-zinc-950/5 dark:hover:bg-white/5'
                    : 'bg-zinc-100 dark:bg-white/10',
                  'text-left text-sm text-zinc-900 dark:text-zinc-200',
                ]
              : [
                  // Default: standard padding and height
                  'py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
                  'min-h-11 sm:min-h-9',
                  'pr-[calc(--spacing(7)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pl-[calc(--spacing(3)-1px)]',
                  // Typography
                  'text-left text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
                  // Border
                  'border border-zinc-950/10 group-data-active:border-zinc-950/20 group-data-hover:border-zinc-950/20 dark:border-white/10 dark:group-data-active:border-white/20 dark:group-data-hover:border-white/20',
                  // Background color (dark)
                  'dark:bg-white/5',
                  // Invalid state
                  'group-data-invalid:border-red-500 group-data-hover:group-data-invalid:border-red-500 dark:group-data-invalid:border-red-600 dark:data-hover:group-data-invalid:border-red-600',
                  // Disabled state
                  'group-data-disabled:border-zinc-950/20 group-data-disabled:opacity-100 dark:group-data-disabled:border-white/15 dark:group-data-disabled:bg-white/2.5 dark:group-data-disabled:data-hover:border-white/15',
                ],
          ])}
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          {compact ? (
            <ChevronDownIcon className="size-4 text-zinc-400 dark:text-zinc-500" />
          ) : (
            <svg
              className="size-5 stroke-zinc-500 group-data-disabled:stroke-zinc-600 sm:size-4 dark:stroke-zinc-400 forced-colors:stroke-[CanvasText]"
              viewBox="0 0 16 16"
              aria-hidden="true"
              fill="none"
            >
              <path
                d="M5.75 10.75L8 13L10.25 10.75"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.25 5.25L8 3L5.75 5.25"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </Headless.ListboxButton>
      <Headless.ListboxOptions
        transition
        anchor={
          anchor ??
          (compact ? { to: 'selection start', gap: -32 } : 'selection start')
        }
        className={clsx(
          // Anchor positioning
          '[--anchor-padding:--spacing(4)]',
          !compact &&
            '[--anchor-offset:-1.625rem] sm:[--anchor-offset:-1.375rem]',
          // Base styles
          'isolate z-[1100] w-max scroll-py-1 rounded-xl select-none',
          compact ? '-ml-1 px-1 py-1' : 'p-1',
          compact
            ? 'min-w-[calc(var(--button-width)+0.5rem)]'
            : 'min-w-[calc(var(--button-width)+1.75rem)]',
          // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
          'outline outline-transparent focus:outline-hidden',
          // Handle scrolling when menu won't fit in viewport
          'overflow-y-scroll overscroll-contain',
          // Popover background
          'bg-white/75 backdrop-blur-xl dark:bg-zinc-800/75',
          // Shadows
          compact
            ? 'shadow-md ring-1 ring-zinc-950/8 dark:ring-white/10 dark:ring-inset'
            : 'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset',
          // Transitions
          'transition-opacity duration-100 ease-in data-closed:data-leave:opacity-0 data-transition:pointer-events-none',
        )}
      >
        {options}
      </Headless.ListboxOptions>
    </Headless.Listbox>
  )
}

export function ListboxOption<T>({
  children,
  className,
  compact,
  ...props
}: {
  className?: string
  compact?: boolean
  children?: React.ReactNode
} & Omit<Headless.ListboxOptionProps<'div', T>, 'as' | 'className'>) {
  const sharedClasses = clsx(
    // Base
    'flex min-w-0 items-center',
    // Icons
    '*:data-[slot=icon]:size-5 *:data-[slot=icon]:shrink-0 sm:*:data-[slot=icon]:size-4',
    compact
      ? '*:data-[slot=icon]:text-zinc-500 group-data-focus/option:*:data-[slot=icon]:text-zinc-900 dark:*:data-[slot=icon]:text-zinc-400'
      : [
          '*:data-[slot=icon]:text-zinc-500 group-data-focus/option:*:data-[slot=icon]:text-white dark:*:data-[slot=icon]:text-zinc-400',
          'forced-colors:*:data-[slot=icon]:text-[CanvasText] forced-colors:group-data-focus/option:*:data-[slot=icon]:text-[Canvas]',
        ],
    // Avatars
    '*:data-[slot=avatar]:-mx-0.5 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:size-5',
  )

  return (
    <Headless.ListboxOption as={Fragment} {...props}>
      {({ selectedOption }) => {
        if (selectedOption) {
          return (
            <div className={clsx(className, sharedClasses)}>{children}</div>
          )
        }

        return (
          <div
            className={clsx(
              compact
                ? [
                    // Compact: simple flex layout, subtle hover, no checkmark column
                    'group/option flex cursor-default items-center justify-between rounded-md py-1 pr-2 pl-3',
                    'text-sm/5 text-zinc-700 dark:text-zinc-300',
                    'outline-hidden data-focus:bg-zinc-100 dark:data-focus:bg-white/10',
                    'data-disabled:opacity-50',
                  ]
                : [
                    // Default: grid with checkmark column
                    'group/option grid cursor-default grid-cols-[--spacing(5)_1fr] items-baseline gap-x-2 rounded-lg py-2.5 pr-3.5 pl-2 sm:grid-cols-[--spacing(4)_1fr] sm:py-1.5 sm:pr-3 sm:pl-1.5',
                    'text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
                    'outline-hidden data-focus:bg-blue-500 data-focus:text-white',
                    'forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText]',
                    'data-disabled:opacity-50',
                  ],
            )}
          >
            {compact ? (
              <>
                <span className={clsx(className, sharedClasses)}>
                  {children}
                </span>
                <svg
                  className="hidden size-3.5 shrink-0 stroke-current group-data-selected/option:inline"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4 8.5l3 3L12 4"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            ) : (
              <>
                <svg
                  className="relative hidden size-5 self-center stroke-current group-data-selected/option:inline sm:size-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4 8.5l3 3L12 4"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className={clsx(className, sharedClasses, 'col-start-2')}>
                  {children}
                </span>
              </>
            )}
          </div>
        )
      }}
    </Headless.ListboxOption>
  )
}

export function ListboxLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        'ml-2.5 truncate first:ml-0 sm:ml-2 sm:first:ml-0',
      )}
    />
  )
}

export function ListboxDescription({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        'flex flex-1 overflow-hidden text-zinc-500 group-data-focus/option:text-white before:w-2 before:min-w-0 before:shrink dark:text-zinc-400',
      )}
    >
      <span className="flex-1 truncate">{children}</span>
    </span>
  )
}
