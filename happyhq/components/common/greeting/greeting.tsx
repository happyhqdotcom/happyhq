'use client'

import Image from 'next/image'

export function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' }
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤️' }
  return { text: 'Good evening', emoji: '🪐' }
}

export function Greeting({ showQ = false }: { showQ?: boolean }) {
  const { text, emoji } = getGreeting()
  return (
    <div
      className={
        showQ ? 'flex w-full items-start gap-4' : 'flex w-full items-start'
      }
    >
      {showQ && (
        <Image
          src="/brand/qutie.png"
          alt="Q"
          width={42}
          height={55}
          className="mt-1 shrink-0"
          draggable={false}
        />
      )}
      <div className="font-display text-left tracking-tight">
        <p className="text-foreground text-lg sm:text-xl">
          {text} {emoji}
        </p>
        <h1 className="text-foreground text-2xl font-medium sm:text-[28px] md:text-[32px]">
          What should we work on next?
        </h1>
      </div>
    </div>
  )
}
