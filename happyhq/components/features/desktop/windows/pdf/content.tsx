'use client'

import type { PdfDocument, PdfViewport } from '@/lib/pdf/pdf-loader'
import { loadPdfDocument } from '@/lib/pdf/pdf-loader'
import { Loader2 } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

// --- PdfPageView: lazy-renders a single PDF page via IntersectionObserver ---

interface PdfPageViewProps {
  pdfDocument: PdfDocument
  pageNumber: number
  displayWidth: number
  displayHeight: number
  scrollContainer: HTMLElement | null
}

const PdfPageView = memo(function PdfPageView({
  pdfDocument,
  pageNumber,
  displayWidth,
  displayHeight,
  scrollContainer,
}: PdfPageViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  // One-shot IntersectionObserver: detect when page is near the viewport, then disconnect
  useEffect(() => {
    const el = containerRef.current
    if (!el || !scrollContainer) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { root: scrollContainer, rootMargin: '200px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollContainer])

  // Render canvas when visible (or when display dimensions change due to resize)
  useEffect(() => {
    if (!isVisible) return

    const el = containerRef.current
    if (!el) return

    let cancelled = false
    let renderTask: { promise: Promise<void>; cancel(): void } | null = null

    const render = async () => {
      const page = await pdfDocument.getPage(pageNumber)
      if (cancelled) return

      const PIXEL_RATIO = window.devicePixelRatio || 2
      const viewport = page.getViewport({ scale: 1.0 })
      const scale = displayWidth / viewport.width
      const renderViewport = page.getViewport({ scale: scale * PIXEL_RATIO })

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx || cancelled) return

      canvas.width = renderViewport.width
      canvas.height = renderViewport.height
      canvas.style.width = `${displayWidth}px`
      canvas.style.height = `${displayHeight}px`
      canvas.className = 'bg-white shadow-sm'

      ctx.save()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      renderTask = page.render({
        canvasContext: ctx,
        viewport: renderViewport,
      })
      await renderTask.promise
      ctx.restore()

      if (cancelled) return
      el.appendChild(canvas)
    }

    render().catch((err) => {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        err.name === 'RenderingCancelledException'
      )
        return
      if (!cancelled) console.error(`PDF page ${pageNumber} render error:`, err)
    })

    return () => {
      cancelled = true
      try {
        renderTask?.cancel()
      } catch {
        // Already complete
      }
      while (el.firstChild) el.removeChild(el.firstChild)
    }
  }, [isVisible, pdfDocument, pageNumber, displayWidth, displayHeight])

  return (
    <div
      ref={containerRef}
      className={isVisible ? '' : 'animate-pulse rounded-sm bg-zinc-200'}
      style={{ width: displayWidth, height: displayHeight }}
    />
  )
})

// --- PdfWindowContent: fetches PDF, computes dimensions, renders lazy pages ---

interface PdfWindowContentProps {
  filePath: string
  loading?: boolean
}

export const PdfWindowContent = memo(function PdfWindowContent({
  filePath,
  loading,
}: PdfWindowContentProps) {
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)
  const [pageDimensions, setPageDimensions] = useState<
    { width: number; height: number }[] | null
  >(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Observe container width for responsive page sizing
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Fetch PDF and load with PDF.js
  useEffect(() => {
    if (loading || !filePath) return

    let cancelled = false
    setFetching(true)
    setError(null)

    fetch(`/api/fs/download?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
      })
      .then((buffer) => loadPdfDocument(buffer))
      .then(({ pdfDocument: doc, pageCount: count }) => {
        if (cancelled) {
          doc.destroy()
          return
        }
        setPdfDocument(doc)
        setPageCount(count)
        setFetching(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load PDF')
        setFetching(false)
      })

    return () => {
      cancelled = true
    }
  }, [filePath, loading])

  // Clean up PDF document on unmount
  useEffect(() => {
    return () => {
      pdfDocument?.destroy()
    }
  }, [pdfDocument])

  // Dimension pass: collect natural viewport sizes for all pages (cheap, no rendering)
  useEffect(() => {
    if (!pdfDocument || pageCount <= 0) return

    let cancelled = false

    const collectDimensions = async () => {
      const dims: { width: number; height: number }[] = []
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDocument.getPage(i)
        if (cancelled) return
        const viewport: PdfViewport = page.getViewport({ scale: 1.0 })
        dims.push({ width: viewport.width, height: viewport.height })
      }
      if (!cancelled) setPageDimensions(dims)
    }

    collectDimensions()
    return () => {
      cancelled = true
    }
  }, [pdfDocument, pageCount])

  // Derive display dimensions from natural dimensions + container width
  const availableWidth = containerWidth - 32 // p-4 = 16px each side
  const displayDimensions = useMemo(() => {
    if (!pageDimensions || availableWidth <= 0) return null
    return pageDimensions.map(({ width, height }) => {
      const scale = availableWidth / width
      return { width: width * scale, height: height * scale }
    })
  }, [pageDimensions, availableWidth])

  const showSpinner = loading || fetching || (pdfDocument && !pageDimensions)

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto bg-zinc-100"
      style={{ contain: 'paint' }}
    >
      {showSpinner && (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-black/30" />
        </div>
      )}
      {error && (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Could not load PDF
          </p>
          <p className="mt-2 max-w-[240px] text-xs leading-relaxed text-zinc-300">
            {error}
          </p>
        </div>
      )}
      {!showSpinner && !error && displayDimensions && (
        <div className="flex flex-col items-center gap-3 p-4">
          {displayDimensions.map((dim, i) => (
            <PdfPageView
              key={i}
              pdfDocument={pdfDocument!}
              pageNumber={i + 1}
              displayWidth={dim.width}
              displayHeight={dim.height}
              scrollContainer={containerRef.current}
            />
          ))}
        </div>
      )}
    </div>
  )
})
