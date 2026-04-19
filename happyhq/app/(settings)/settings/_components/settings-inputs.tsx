'use client'

import { useState } from 'react'

/**
 * Internal hook for draft-state inputs: shows a draft while focused,
 * commits on blur, and reverts to the formatted value when not editing.
 */
function useDraftState(value: string) {
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? value
  return { draft, setDraft, display }
}

const wrapperBase =
  'flex items-center rounded-lg bg-zinc-100 py-1 ring-1 ring-transparent transition-shadow focus-within:ring-zinc-300 dark:bg-white/10 dark:focus-within:ring-white/20'

const inputBase =
  'min-w-0 grow bg-transparent py-0 text-sm text-zinc-900 focus:outline-none dark:text-zinc-200'

export function SettingsTextInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const { draft, setDraft, display } = useDraftState(value)

  return (
    <div className={`${wrapperBase} px-3 ${className ?? ''}`}>
      <input
        type="text"
        value={display}
        placeholder={placeholder}
        onFocus={() => setDraft(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) {
            onChange(draft)
          }
          setDraft(null)
        }}
        className={`${inputBase} placeholder:text-zinc-400`}
      />
    </div>
  )
}

export function SettingsCurrencyInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: string) => void
}) {
  const { draft, setDraft, display } = useDraftState(value.toFixed(2))

  return (
    <div className={`${wrapperBase} w-28 pr-3 pl-3`}>
      <span className="shrink-0 text-sm text-zinc-400 select-none">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onFocus={() => setDraft(value.toFixed(2))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const num = parseFloat(draft ?? '')
          if (!isNaN(num) && num >= 0) {
            onChange(num.toFixed(2))
          }
          setDraft(null)
        }}
        className={`${inputBase} pl-1`}
      />
    </div>
  )
}

export function SettingsNumericInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: string) => void
}) {
  const { draft, setDraft, display } = useDraftState(String(value))

  return (
    <div className={`${wrapperBase} w-20 px-3`}>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const num = parseInt(draft ?? '', 10)
          if (!isNaN(num) && num >= 1) {
            onChange(String(num))
          }
          setDraft(null)
        }}
        className={inputBase}
      />
    </div>
  )
}
