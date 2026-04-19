import { Button } from '@/components/common/ui/button'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex h-screen flex-col items-center justify-center">
      <div className="flex max-w-md flex-col items-center text-center">
        <h1 className="text-foreground text-lg font-semibold">Not Found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
