import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface StickerProps {
  src: string
  alt: string
  size?: number
  rotate?: number
  className?: string
}

export function Sticker({
  src,
  alt,
  size = 120,
  rotate = -6,
  className,
}: StickerProps) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      whileHover={{ scale: 1.05 }}
      whileDrag={{ scale: 1.1, cursor: 'grabbing' }}
      className={cn(
        'relative inline-block cursor-grab will-change-transform',
        className,
      )}
      style={{
        width: size,
        rotate,
        filter: [
          // thin dark edge all around — applied after the white border
          'drop-shadow(0px -1px 0.5px rgba(0,0,0,0.1))',
          'drop-shadow(0px 1px 0.5px rgba(0,0,0,0.1))',
          'drop-shadow(-1px 0px 0.5px rgba(0,0,0,0.1))',
          'drop-shadow(1px 0px 0.5px rgba(0,0,0,0.1))',
          // raised edge — light top-left, dark bottom-right
          'drop-shadow(-1px -1px 0 rgba(255,255,255,0.7))',
          'drop-shadow(1px 1px 0 rgba(0,0,0,0.08))',
        ].join(' '),
      }}
    >
      {/* inner layer: white border */}
      <div
        style={{
          filter: [
            'drop-shadow(0px -3px 0 white)',
            'drop-shadow(0px 3px 0 white)',
            'drop-shadow(-3px 0px 0 white)',
            'drop-shadow(3px 0px 0 white)',
            'drop-shadow(2px 2px 0 white)',
            'drop-shadow(-2px 2px 0 white)',
            'drop-shadow(2px -2px 0 white)',
            'drop-shadow(-2px -2px 0 white)',
          ].join(' '),
        }}
      >
        <img src={src} alt={alt} className="block w-full" draggable={false} />
      </div>
    </motion.div>
  )
}
