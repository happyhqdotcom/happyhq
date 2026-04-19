'use client'

import { Switch } from '@/components/common/ui/switch'

import type { PlaygroundComponent, PlaygroundControl } from '../_registry/types'
import { usePlaygroundStore } from './playground-store'

function ToggleControl({
  name,
  control,
  value,
  onChange,
}: {
  name: string
  control: PlaygroundControl
  value: boolean
  onChange: (name: string, value: unknown) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-sm text-zinc-600">{control.label}</span>
      <Switch
        checked={value}
        onCheckedChange={(checked) => onChange(name, checked)}
      />
    </label>
  )
}

function SliderControl({
  name,
  control,
  value,
  onChange,
}: {
  name: string
  control: PlaygroundControl
  value: number
  onChange: (name: string, value: unknown) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-600">{control.label}</span>
        <span className="text-xs text-zinc-400 tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={control.min ?? 0}
        max={control.max ?? 100}
        step={control.step ?? 1}
        value={value}
        onChange={(e) => onChange(name, parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900"
      />
    </div>
  )
}

function SelectControl({
  name,
  control,
  value,
  onChange,
}: {
  name: string
  control: PlaygroundControl
  value: unknown
  onChange: (name: string, value: unknown) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-zinc-600">{control.label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const option = control.options?.find(
            (o) => String(o.value) === e.target.value,
          )
          if (option) onChange(name, option.value)
        }}
        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200"
      >
        {control.options?.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ControlsPanel({
  component,
}: {
  component: PlaygroundComponent | null
}) {
  const controlValues = usePlaygroundStore((s) => s.controlValues)
  const setControl = usePlaygroundStore((s) => s.setControl)

  if (!component?.controls) return null

  const entries = Object.entries(component.controls)
  if (entries.length === 0) return null

  return (
    <div className="border-b border-black/5 px-4 py-3">
      <p className="mb-2 text-xs font-medium tracking-wider text-zinc-400 uppercase">
        Controls
      </p>
      <div className="flex flex-col gap-3">
        {entries.map(([name, control]) => {
          const value = controlValues[name] ?? control.default

          switch (control.type) {
            case 'toggle':
              return (
                <ToggleControl
                  key={name}
                  name={name}
                  control={control}
                  value={Boolean(value)}
                  onChange={setControl}
                />
              )
            case 'slider':
              return (
                <SliderControl
                  key={name}
                  name={name}
                  control={control}
                  value={Number(value)}
                  onChange={setControl}
                />
              )
            case 'select':
              return (
                <SelectControl
                  key={name}
                  name={name}
                  control={control}
                  value={value}
                  onChange={setControl}
                />
              )
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
