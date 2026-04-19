export function UploadIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="border-t border-zinc-100 px-3 py-1.5 text-center text-xs text-zinc-400">
      Adding...
    </div>
  )
}
