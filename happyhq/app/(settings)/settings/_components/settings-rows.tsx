'use client'

import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/common/catalyst/listbox'
import {
  SettingsCurrencyInput,
  SettingsNumericInput,
  SettingsTextInput,
} from './settings-inputs'
import { SettingsRow } from './settings-row'

export function ListboxRow<T extends string>({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label: string
  description?: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <SettingsRow label={label} description={description}>
      <Listbox
        value={value}
        onChange={(val) => onChange(val as T)}
        compact
        className="w-40"
      >
        {options.map((opt) => (
          <ListboxOption key={opt.value} value={opt.value} compact>
            <ListboxLabel>{opt.label}</ListboxLabel>
          </ListboxOption>
        ))}
      </Listbox>
    </SettingsRow>
  )
}

export function TextRow({
  label,
  description,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <SettingsRow label={label} description={description}>
      <SettingsTextInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className ?? 'w-48'}
      />
    </SettingsRow>
  )
}

export function CurrencyRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description?: string
  value: number
  onChange: (value: string) => void
}) {
  return (
    <SettingsRow label={label} description={description}>
      <SettingsCurrencyInput value={value} onChange={onChange} />
    </SettingsRow>
  )
}

export function NumericRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description?: string
  value: number
  onChange: (value: string) => void
}) {
  return (
    <SettingsRow label={label} description={description}>
      <SettingsNumericInput value={value} onChange={onChange} />
    </SettingsRow>
  )
}
