'use client'

import { CircleAlertIcon, Loader2Icon } from 'lucide-react'
import { Toaster as Sonner, toast, ToasterProps } from 'sonner'

// Error toasts persist until dismissed
export const toastError = (message: string) =>
  toast.error(message, { duration: Infinity })

// Warning toasts stay visible longer than the 4s default
export const toastWarning = (message: string) =>
  toast.warning(message, { duration: 8000 })

// Auth-error toast — same affordance as toastError, but rendered as a custom
// JSX node so we can stamp `data-role="auth-error"` on the wrapper. The
// exercise harness uses that selector to detect missing/invalid credentials
// without reaching into Sonner-internal markup.
export const toastAuthError = (message: string) =>
  toast.custom(
    () => (
      <div
        data-role="auth-error"
        role="alert"
        className="flex w-[var(--width)] items-center gap-3 rounded-xl bg-white/95 p-4 shadow-lg ring-1 ring-black/5 backdrop-blur-xl"
      >
        <CircleAlertIcon className="size-4 shrink-0 text-[#E83838]" />
        <span className="text-sm text-[#a82020]">{message}</span>
      </div>
    ),
    { duration: Infinity },
  )

// Light mode only — no next-themes dependency needed
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      closeButton
      icons={{
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        className: 'backdrop-blur-xl !border-0 !rounded-xl !text-zinc-700',
        classNames: {
          success: '!text-[#1a7a52] [&_svg]:!text-[#29A976]',
          error: '!text-[#a82020] [&_svg]:!text-[#E83838]',
          warning: '!text-[#b06520] [&_svg]:!text-[#FF9E4E]',
          info: '!text-[#9a3a9d] [&_svg]:!text-[#DE6DE2]',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
