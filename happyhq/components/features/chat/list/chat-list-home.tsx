'use client'

import { Greeting } from '@/components/common/greeting/greeting'
import { Sticker } from '@/components/common/sticker'
import { useIsMobile } from '@/hooks/use-mobile'
import type { HomeBranding, ResolvedConfig } from '@/lib/config/types'
import type { ChatItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { allChatsKey } from '@/lib/swr-keys'
import { groupByTime } from '@/lib/time-groups'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import useSWR from 'swr'
import { ChatListItem } from './chat-list-item'
import { HomeComposer } from './home-composer/home-composer'

const EMPTY_CHATS: ChatItem[] = []
const RANDOM_CHOICES: HomeBranding[] = ['stickers', 'poolside', 'logo', 'q']

export function ChatListHome() {
  const [expanded, setExpanded] = useState(false)
  const [showStickers, setShowStickers] = useState(true)
  const isMobile = useIsMobile()

  // Branding mode from config (settings → General → Home branding)
  const { data: config } = useSWR<ResolvedConfig>('/api/config', fetcher)
  const [randomChoice] = useState<HomeBranding>(
    () => RANDOM_CHOICES[Math.floor(Math.random() * RANDOM_CHOICES.length)],
  )
  const homeBranding = config?.appearance.homeBranding ?? 'none'
  const branding = homeBranding === 'random' ? randomChoice : homeBranding

  const { data: chats = EMPTY_CHATS } = useSWR<ChatItem[]>(
    allChatsKey(),
    fetcher,
    { revalidateOnFocus: true },
  )

  const groups = groupByTime(chats, (c) => c.createdAt)
  const [firstGroup, ...restGroups] = groups
  const recents = firstGroup?.items.slice(0, 3) ?? []

  return (
    <div className="relative flex h-svh flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-16 pb-24">
        {/* Greeting */}
        <Greeting showQ={branding === 'q'} />

        {/* Composer */}
        <div className="mt-8">
          <HomeComposer />
        </div>

        {/* Chat list */}
        <div className="mt-10 px-3">
          {chats.length > 0 ? (
            <div className="-mx-3 flex flex-col">
              {expanded ? (
                <>
                  <div className="mb-3 flex items-center justify-between px-2">
                    <p className="text-muted-foreground text-xs font-medium">
                      Recents
                    </p>
                    <button
                      onClick={() => setExpanded(false)}
                      className="text-muted-foreground text-xs font-medium"
                    >
                      See Less
                    </button>
                  </div>
                  {firstGroup?.items.map((item) => (
                    <ChatListItem
                      key={`${item.streamName}-${item.sessionId}`}
                      item={item}
                    />
                  ))}
                  {restGroups.map((group) => (
                    <TimeGroup
                      key={group.label}
                      label={group.label}
                      items={group.items}
                    />
                  ))}
                </>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between px-2">
                    <p className="text-muted-foreground text-xs font-medium">
                      Recents
                    </p>
                    <button
                      onClick={() => setExpanded(true)}
                      className="text-muted-foreground text-xs font-medium"
                    >
                      See More
                    </button>
                  </div>
                  {recents.map((item) => (
                    <ChatListItem
                      key={`${item.streamName}-${item.sessionId}`}
                      item={item}
                    />
                  ))}
                </>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Stickers mode — draggable brand illustrations (desktop only) */}
      {branding === 'stickers' && !isMobile && (
        <>
          <AnimatePresence>
            {showStickers && (
              <>
                <Sticker
                  src="/brand/qutie-avatar.png"
                  alt="Q"
                  size={120}
                  rotate={0}
                  className="absolute top-[15%] left-[15%] hidden sm:block"
                />
                <Sticker
                  src="/brand/bush-01.png"
                  alt="Bush"
                  size={140}
                  rotate={-3}
                  className="absolute top-[8%] left-[30%] hidden sm:block"
                />
                <Sticker
                  src="/brand/umbrella.png"
                  alt="Umbrella"
                  size={280}
                  rotate={-8}
                  className="absolute top-[10%] left-[48%] hidden sm:block"
                />
                <Sticker
                  src="/brand/bush-02.png"
                  alt="Bush"
                  size={120}
                  rotate={5}
                  className="absolute top-[8%] left-[75%] hidden sm:block"
                />
                <Sticker
                  src="/brand/worm-01.png"
                  alt="Worm"
                  size={100}
                  rotate={-4}
                  className="absolute top-[46%] left-[16%] hidden sm:block"
                />
                <Sticker
                  src="/brand/rainbow-chard.png"
                  alt="Rainbow chard"
                  size={100}
                  rotate={12}
                  className="absolute top-[38%] right-[12%] hidden sm:block"
                />
                <Sticker
                  src="/brand/poolside.png"
                  alt="Poolside"
                  size={360}
                  rotate={3}
                  className="absolute top-[68%] left-[5%] hidden sm:block"
                />
                <Sticker
                  src="/brand/logo.svg"
                  alt="HappyHQ logo"
                  size={500}
                  rotate={-5}
                  className="absolute top-[66%] left-[36%] hidden sm:block"
                />
                <Sticker
                  src="/brand/potted-plant.png"
                  alt="Potted plant"
                  size={120}
                  rotate={6}
                  className="absolute top-[68%] right-[15%] hidden sm:block"
                />
              </>
            )}
          </AnimatePresence>
          <motion.img
            src="/brand/gophie-peace.png"
            alt="C mascot"
            className="absolute bottom-0 left-1/2 -mb-5 hidden w-28 -translate-x-1/2 cursor-pointer sm:block"
            draggable={false}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowStickers((s) => !s)}
          />
        </>
      )}

      {/* Poolside mode */}
      {branding === 'poolside' && !isMobile && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-[60%] sm:block">
          <Image
            src="/brand/poolside.png"
            alt="Poolside"
            width={1734}
            height={904}
            className="w-full"
            style={{ height: 'auto' }}
            draggable={false}
          />
        </div>
      )}

      {/* Logo mode */}
      {branding === 'logo' && !isMobile && (
        <Sticker
          src="/brand/logo.svg"
          alt="HappyHQ logo"
          size={500}
          rotate={-5}
          className="absolute top-[68%] left-[34%] hidden sm:block"
        />
      )}
    </div>
  )
}

function TimeGroup({ label, items }: { label: string; items: ChatItem[] }) {
  return (
    <div className="mt-6">
      <p className="text-muted-foreground mb-3 px-2 text-xs font-medium">
        {label}
      </p>
      {items.map((item) => (
        <ChatListItem
          key={`${item.streamName}-${item.sessionId}`}
          item={item}
        />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
        <MessageCircle className="text-muted-foreground size-6" />
      </div>
      <p className="text-muted-foreground mt-4 text-sm">
        No chats yet. Start one above.
      </p>
    </div>
  )
}
