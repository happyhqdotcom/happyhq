# Input Types

How different file formats are processed into forms that both humans and agents can work with.

## Purpose

When a user drops a file into Q, two things need to happen: the agent needs to read it, and the human needs to see it. Sometimes the same artifact serves both — a PDF's extracted text works for the agent, and the PDF viewer works for the human. Sometimes they diverge — an email's raw MIME is useless to both, so we extract structured JSON for the agent and render a purpose-built viewer for the human.

This spec defines the extraction pipeline, the conventions each format follows, and the pattern for adding new formats. It's the reference Ralphie uses when building support for a new input type.

## The Pattern

Every input type follows the same structure on disk:

```
{slug}/
  original.{ext}         # The user's file, always preserved
  {extracted-form}        # Agent-readable extraction (format varies by type)
  {additional files...}   # Optional — e.g., attachments extracted from an email
```

The **original** is the source of truth. The **extracted form** is the agent-readable version — what `resolveReadable()` returns and what the agent reads first. The extracted form varies by type because different formats have different structures worth preserving.

## Current Input Types

### PDF

| Aspect            | Detail                                                         |
| ----------------- | -------------------------------------------------------------- |
| Extension         | `.pdf`                                                         |
| Extracted form    | `raw.txt` — plain text, pages joined with `\n\n`               |
| Extraction engine | `@hyzyla/pdfium` (Chrome's PDF renderer via WASM)              |
| Human viewer      | `PdfWindow` — renders pages via PDF.js, with "View Raw" toggle |
| Agent reads       | `raw.txt`                                                      |
| Additional files  | None                                                           |

Plain text extraction works well for text-heavy PDFs (reports, proposals, contracts). It loses layout, tables, and images. Good enough for most business documents.

### Email (.eml)

| Aspect            | Detail                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension         | `.eml`                                                                                                                                      |
| Extracted form    | `email.json` — structured: `{ subject, from, to, cc?, date?, body, attachments }`                                                           |
| Extraction engine | `mailparser` (simpleParser)                                                                                                                 |
| Human viewer      | `EmailWindow` — header rows (From/To/CC/Date), body text, clickable attachment chips                                                        |
| Agent reads       | `email.json`                                                                                                                                |
| Additional files  | Extracted attachments saved as separate files (e.g., `image001.jpg`, `brochure.pdf`). Inline CID images (HTML email decoration) are skipped |

The body text is cleaned: prefers the plain text version of the email, falls back to stripping HTML. Common footer content (unsubscribe links, copyright notices, disclaimers) is truncated.

Attachment filenames come from the email itself — Outlook names inline images generically (`image001.jpg`, `image002.png`). We preserve these names as-is.

### Images

Images arrive as attachments extracted from emails or as standalone uploads.

| Aspect         | Detail                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Extensions     | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`                                                          |
| Extracted form | None currently — see below                                                                                |
| Human viewer   | `ImageWindow` — auto-sizes to image aspect ratio, `object-fit: contain`, `bg-zinc-100` with `p-4` gutters |
| Agent reads    | The image file directly (multimodal)                                                                      |

**Future: vision-based extraction.** Right now the agent reads images directly via multimodal, which works but is expensive — every agent that touches the image pays the full vision token cost. For images with concrete data (property brochures, screenshots of spreadsheets, business cards), a one-time vision extraction at upload time would produce a text description the agent reads cheaply on every subsequent access. Same pattern as other types: extract once, store as `description.txt` or `image.json`, agent reads the extracted form first, falls back to the original image when it needs to look at something the description didn't capture. This is a good candidate for early implementation — the Cubex brochure image is a clear example where re-reading the image every time is wasteful.

### Word (.docx)

| Aspect            | Detail                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Extension         | `.docx`                                                                                                         |
| Extracted form    | `content.md` — Markdown with headings, lists, tables (complex tables preserved as HTML)                         |
| Extraction engine | `mammoth` (DOCX → HTML) + `turndown` with GFM plugin (HTML → Markdown)                                          |
| Human viewer      | `MarkdownWindow` — renders via react-markdown with rehype-raw + rehype-sanitize for inline HTML                 |
| Agent reads       | `content.md`                                                                                                    |
| Additional files  | Embedded images extracted as sibling files (`image1.png`, etc.), referenced in markdown as `![alt](imageN.ext)` |

Mammoth understands DOCX semantics (headings, bold, lists, tables) and produces clean HTML. Turndown with the GFM plugin converts this to Markdown. Simple tables become pipe tables; complex tables (nested tables, lists inside cells, colspan) stay as HTML — both are readable by the agent and renderable by the viewer via rehype-raw.

Only `.docx` (modern XML-in-zip format) is supported. The old binary `.doc` format requires a different approach — recommend "save as .docx" for those files.

## Planned Input Types

These are formats we expect to support. Each should follow the same pattern: preserve the original, produce an extracted form, build a viewer if needed.

### Build extraction for

These formats are common enough and structured enough that native extraction is worth it.

| Format               | Likely extracted form      | Viewer                     | Notes                                                                                                                                    |
| -------------------- | -------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| CSV (.csv)           | None needed — already text | Table viewer               | Agent reads directly. Simple table window for humans                                                                                     |
| Excel (.xlsx)        | `data.json` or `raw.csv`   | Table viewer               | Structured data — JSON for the agent, table for humans                                                                                   |
| Calendar (.ics)      | `event.json`               | Structured event viewer    | Date, time, location, attendees, description                                                                                             |
| Web page (URL)       | `page.json` + `raw.txt`    | Article viewer or markdown | Metadata + extracted article text                                                                                                        |
| AI chat (share link) | `chat.json`                | Conversation viewer        | Claude/ChatGPT share links return structured conversation data. Extract turns with roles. Valuable for feeding prior research into tasks |

### Recommend "export as PDF"

These formats are visual-layout-dependent or proprietary. Extracting text loses the point. The pragmatic path: tell users to export as PDF first.

| Format                 | Why not native extraction                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PowerPoint (.pptx)     | Text extraction possible (XML-in-zip) but slides are visual — layout, diagrams, and images carry the meaning. PDF preserves this |
| Keynote (.key)         | Proprietary Apple format. No good cross-platform extraction libraries                                                            |
| Google Slides (export) | Same as PPT — visual format, PDF is the right export                                                                             |
| Figma / design files   | Visual by nature. Screenshot or PDF export                                                                                       |

For these, the composer could show a helpful message: "For best results, export this as PDF before uploading."

## Adding a New Input Type

When adding support for a new file format:

1. **Extraction module** — Create `lib/{type}/extract-text.server.ts` (or similar). Export a function that takes a `Buffer` and returns the extracted form plus any additional files. Keep shared types in a separate `types.ts` file (not the `.server.ts` file) so client components can import them.

2. **Wire into upload** — Add an `else if` branch in `uploadFile()` and `ingestFile()` in `lib/actions.ts`. Write the extracted form and any additional files to the upload directory. Follow the existing try/catch + `console.warn` pattern for graceful failure.

3. **Update ProcessSample** — Add the new extension to the `supportedExts` array in `tools.server.ts`. Add an extraction branch in the fallback section.

4. **Update resolveReadable** — Add the new extracted filename to `resolveReadable()` in `lib/agents/prompts.server.ts` and update `listFileItems()` in `lib/fs/read.server.ts` to recognise it.

5. **Composer** — Add the extension to `accept` and the drag-drop filter in `composer.tsx`. Add the file type to `FileIcon` in `file-icon.tsx`.

6. **Viewer** — If the format benefits from structured rendering, create a new window component in `components/features/desktop/windows/{type}/`. Add the content type to `windowStore.ts` (interface, union types, `SavedWindowState`, `restoreLayout`), the save mapping in `desktop-data-provider.tsx`, the routing in `use-desktop-windows.ts`, and the render switch in `desktop-window.tsx`.

7. **Prompt** — Update the extracted form list in `prompts/learning.md` so the agent knows about the new format.

8. **Specs** — Update this spec's Current Input Types table, `filesystem-layout.md`, and `desktop.md`'s window content types table.

## Key Files

| File                                                         | Role                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `lib/docx/extract-text.server.ts`                            | DOCX extraction (mammoth + turndown → markdown)                         |
| `lib/eml/extract-text.server.ts`                             | Email extraction (reference implementation)                             |
| `lib/eml/types.ts`                                           | Shared types for email metadata (importable by client)                  |
| `lib/pdf/extract-text.server.ts`                             | PDF text extraction                                                     |
| `lib/actions.ts`                                             | `uploadFile()` / `ingestFile()` — wires extraction into upload pipeline |
| `lib/agents/tools.server.ts`                                 | `ProcessSample` — validates extensions, fallback extraction             |
| `lib/agents/prompts.server.ts`                               | `resolveReadable()` — picks agent-readable file per directory           |
| `lib/fs/read.server.ts`                                      | `listFileItems()` — discovers extracted form for UI (`rawPath` field)   |
| `components/features/chat/composer.tsx`                      | File accept filter + drag-drop filter + `FileCard` icon                 |
| `components/features/desktop/windows/shared/file-icon.tsx`   | `getFileType()` + icon/color mapping                                    |
| `components/features/desktop/windows/use-desktop-windows.ts` | `openFileWindow()` — routes by extension                                |
| `stores/windowStore.ts`                                      | Window type definitions, save/restore                                   |
