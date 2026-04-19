import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export interface DocxImage {
  filename: string
  content: Buffer
}

export interface DocxExtraction {
  markdown: string
  images: DocxImage[]
}

/**
 * Convert a .docx buffer to Markdown plus extracted images.
 *
 * Uses mammoth (DOCX → HTML) then turndown + GFM plugin (HTML → Markdown).
 * Embedded images are extracted as separate buffers and referenced in the
 * markdown as ![alt](imageN.ext).
 */
export async function extractContentFromDocx(
  docxBuffer: Buffer,
): Promise<DocxExtraction> {
  const images: DocxImage[] = []
  let imageCount = 0

  const result = await mammoth.convertToHtml(
    { buffer: docxBuffer },
    {
      convertImage: mammoth.images.imgElement(function (image: any) {
        imageCount++
        const ext = image.contentType
          ? '.' + image.contentType.split('/')[1].replace('jpeg', 'jpg')
          : '.png'
        const filename = `image${imageCount}${ext}`

        return image.read().then((buffer: Buffer) => {
          images.push({ filename, content: buffer })
          return { src: filename }
        })
      }),
    },
  )

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })
  turndown.use(gfm)

  const markdown = turndown.turndown(result.value)

  return { markdown, images }
}
