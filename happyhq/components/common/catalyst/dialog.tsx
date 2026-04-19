import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import type React from 'react'
import { Text } from './text'

const sizes = {
  xs: 'sm:max-w-xs',
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
}

export function Dialog({
  size = 'lg',
  className,
  children,
  topAligned = false,
  transparent = false,
  ...props
}: {
  size?: keyof typeof sizes
  className?: string
  children: React.ReactNode
  topAligned?: boolean
  transparent?: boolean
} & Omit<Headless.DialogProps, 'as' | 'className'>) {
  return (
    <Headless.Dialog {...props}>
      <Headless.DialogBackdrop
        transition
        className={clsx(
          'fixed inset-0 z-1050 flex w-screen justify-center overflow-y-auto px-2 py-2 transition duration-100 focus:outline-0 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16',
          transparent ? 'bg-transparent' : 'bg-zinc-950/25 dark:bg-zinc-950/50',
        )}
      />

      <div className="fixed inset-0 z-1060 w-screen overflow-y-auto pt-6 sm:pt-0">
        <div
          className={clsx(
            'grid min-h-full justify-items-center',
            topAligned
              ? 'grid-rows-[auto_1fr] pt-2'
              : 'grid-rows-[1fr_auto] sm:grid-rows-[1fr_auto_3fr] sm:p-4',
          )}
        >
          <Headless.DialogPanel
            transition
            className={clsx(
              className,
              sizes[size],
              'w-full min-w-0 rounded-t-3xl bg-white p-(--gutter) shadow-lg ring-1 ring-zinc-950/10 [--gutter:--spacing(8)] sm:mb-auto sm:rounded-2xl dark:bg-zinc-900 dark:ring-white/10 forced-colors:outline',
              'transition duration-100 will-change-transform data-closed:opacity-0 data-enter:ease-out data-leave:ease-in',
              topAligned
                ? 'row-start-1 origin-top data-closed:scale-x-[0.98] data-closed:scale-y-95'
                : 'row-start-2 data-closed:translate-y-12 sm:data-closed:translate-y-0 sm:data-closed:data-enter:scale-95',
            )}
          >
            {children}
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>
  )
}

export function DialogTitle({
  className,
  ...props
}: { className?: string } & Omit<
  Headless.DialogTitleProps,
  'as' | 'className'
>) {
  return (
    <Headless.DialogTitle
      {...props}
      className={clsx(
        className,
        'text-md/6 font-semibold text-balance text-zinc-950 sm:text-base/6 dark:text-white',
      )}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: { className?: string } & Omit<
  Headless.DescriptionProps<typeof Text>,
  'as' | 'className'
>) {
  return (
    <Headless.Description
      as={Text}
      {...props}
      className={clsx(className, 'mt-2 text-pretty')}
    />
  )
}

export function DialogBody({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'mt-6')} />
}

export function DialogActions({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'mt-8 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto',
      )}
    />
  )
}

export function DialogFooter({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'rounded-b-2xl border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400',
      )}
    />
  )
}
