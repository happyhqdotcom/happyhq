import { PDFiumLibrary } from '@hyzyla/pdfium'

let library: PDFiumLibrary | null = null

async function ensureLibrary(): Promise<PDFiumLibrary> {
  if (!library) library = await PDFiumLibrary.init()
  return library
}

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const lib = await ensureLibrary()
  const doc = await lib.loadDocument(pdfBuffer)
  try {
    const pageCount = doc.getPageCount()
    let text = ''
    for (let i = 0; i < pageCount; i++) {
      const page = doc.getPage(i)
      text += page.getText()
      if (i < pageCount - 1) text += '\n\n'
    }
    return text
  } finally {
    doc.destroy()
  }
}
