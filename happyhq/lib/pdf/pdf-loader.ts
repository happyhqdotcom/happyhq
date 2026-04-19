/**
 * PDF.js loader utility
 *
 * Handles dynamic loading of PDF.js library from CDN and PDF document loading.
 * This is separate from server-side PDF processing (extract-text.server.ts) which uses PDFium.
 */

// PDF.js types
export interface PdfDocument {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPage>
  destroy(): Promise<void>
}

export interface PdfPage {
  getViewport(params: { scale: number }): PdfViewport
  render(params: {
    canvasContext: CanvasRenderingContext2D
    viewport: PdfViewport
  }): { promise: Promise<void>; cancel(): void }
}

export interface PdfViewport {
  width: number
  height: number
}

// PDF.js document source - URL string or raw data
type DocumentSource = string | { data: ArrayBuffer }

interface PdfjsLib {
  getDocument(source: DocumentSource): { promise: Promise<PdfDocument> }
  GlobalWorkerOptions: {
    workerSrc: string
  }
}

declare global {
  interface Window {
    pdfjsLib?: PdfjsLib
  }
}

const PDF_JS_VERSION = '3.11.174'
const PDF_JS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}`

/**
 * Load PDF.js library from CDN
 * Only loads once per session (cached in window.pdfjsLib)
 */
async function loadPdfJsLibrary(): Promise<void> {
  if (window.pdfjsLib) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${PDF_JS_CDN}/pdf.min.js`
    script.onload = () => {
      // Configure worker immediately after library loads
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDF_JS_CDN}/pdf.worker.min.js`
      }
      resolve()
    }
    script.onerror = () => reject(new Error('Failed to load PDF.js library'))
    document.head.appendChild(script)
  })
}

/**
 * Load PDF document using PDF.js
 *
 * Automatically loads PDF.js library if not already loaded.
 * Returns PDF document object and page count.
 *
 * @param source - URL string for remote files, or ArrayBuffer for local data
 * @returns Promise with PDF document and page count
 * @throws Error if PDF.js fails to load or document fails to load
 */
export async function loadPdfDocument(
  source: string | ArrayBuffer,
): Promise<{ pdfDocument: PdfDocument; pageCount: number }> {
  // Ensure PDF.js library is loaded
  await loadPdfJsLibrary()

  if (!window.pdfjsLib) {
    throw new Error('PDF.js library failed to initialize')
  }

  // Load PDF document - use data wrapper for ArrayBuffer
  const documentSource = typeof source === 'string' ? source : { data: source }
  const loadingTask = window.pdfjsLib.getDocument(documentSource)
  const pdfDocument = await loadingTask.promise

  return {
    pdfDocument,
    pageCount: pdfDocument.numPages,
  }
}
