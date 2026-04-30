'use client'

import type { HomeBranding } from '@/lib/config/types'
import { cn } from '@/lib/utils'
import { Radio, RadioGroup } from '@headlessui/react'
import { CircleOff, Shuffle } from 'lucide-react'
import Image from 'next/image'

const BRANDING_OPTIONS: {
  value: HomeBranding
  label: string
  className?: string
}[] = [
  { value: 'random', label: 'Random' },
  { value: 'stickers', label: 'Stickers' },
  { value: 'poolside', label: 'Poolside' },
  { value: 'logo', label: 'Logo' },
  {
    value: 'q',
    label: 'Q',
    className:
      'bg-[#c964a8] border-[#c964a8] hover:bg-[#c964a8] hover:border-[#b85a98] data-checked:bg-[#c964a8] data-checked:border-[#93407a]',
  },
  { value: 'none', label: 'None' },
]

/** Mini sticker with the white-border drop-shadow effect, scaled for thumbnails */
function MiniSticker({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={48}
      height={48}
      unoptimized
      draggable={false}
      className={cn('block', className)}
      style={{
        height: 'auto',
        filter: [
          'drop-shadow(0px -1.5px 0 white)',
          'drop-shadow(0px 1.5px 0 white)',
          'drop-shadow(-1.5px 0px 0 white)',
          'drop-shadow(1.5px 0px 0 white)',
          'drop-shadow(1px 1px 0 white)',
          'drop-shadow(-1px 1px 0 white)',
          'drop-shadow(1px -1px 0 white)',
          'drop-shadow(-1px -1px 0 white)',
          'drop-shadow(0px 0.5px 0.5px rgba(0,0,0,0.1))',
        ].join(' '),
      }}
    />
  )
}

function OptionPreview({ value }: { value: HomeBranding }) {
  switch (value) {
    case 'stickers':
      return (
        <div className="relative h-12 w-12">
          <MiniSticker
            src="/brand/umbrella.png"
            alt="Umbrella"
            className="absolute -top-0.5 left-1/2 z-10 w-8 -translate-x-1/2"
          />
          <MiniSticker
            src="/brand/rainbow-chard.png"
            alt="Rainbow chard"
            className="absolute -bottom-0.5 left-0 w-5 -rotate-12"
          />
          <MiniSticker
            src="/brand/potted-plant.png"
            alt="Plant"
            className="absolute right-0.5 -bottom-0.5 w-6 rotate-12"
          />
        </div>
      )
    case 'poolside':
      return (
        <Image
          src="/brand/poolside.png"
          alt="Poolside"
          width={1734}
          height={904}
          className="absolute bottom-0 left-0 w-full translate-y-1/3 object-contain"
          style={{ height: 'auto' }}
          draggable={false}
        />
      )
    case 'logo':
      return (
        <MiniSticker
          src="/brand/logo.svg"
          alt="HappyHQ logo"
          className="w-12"
        />
      )
    case 'q':
      return (
        <Image
          src="/brand/qutie-avatar.png"
          alt="Q"
          width={713}
          height={1005}
          className="w-10 object-contain"
          style={{ height: 'auto' }}
          draggable={false}
        />
      )
    case 'random':
      return <Shuffle className="h-5 w-5 text-zinc-400" />
    case 'none':
      return <CircleOff className="h-5 w-5 text-zinc-400" />
  }
}

export function HomeBrandingPicker({
  value,
  onChange,
}: {
  value: HomeBranding
  onChange: (value: HomeBranding) => void
}) {
  return (
    <RadioGroup
      value={value}
      onChange={(v: string) => onChange(v as HomeBranding)}
      className="flex gap-2"
    >
      {BRANDING_OPTIONS.map((opt) => (
        <Radio
          key={opt.value}
          value={opt.value}
          title={opt.label}
          className={cn(
            'relative flex size-18 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border p-3 transition',
            'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100',
            'data-checked:border-zinc-400 data-checked:bg-white data-checked:shadow-sm',
            'outline-none data-focus:ring-2 data-focus:ring-zinc-400 data-focus:ring-offset-1',
            opt.className,
          )}
        >
          <OptionPreview value={opt.value} />
        </Radio>
      ))}
    </RadioGroup>
  )
}
