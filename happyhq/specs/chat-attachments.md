# Chat Attachments

Files a user attaches to a chat message — from upload through inline preview.

## Purpose

Define the full lifecycle of a chat attachment: how it's staged in the composer, uploaded to disk, persisted in `chat.json`, surfaced on `ChatMessage`, rendered as a pill, and opened in an inline preview when the user clicks. One data shape across all stages, one path-derivation helper, one preview overlay.

This spec owns attachments. [Chat](chat.md) cross-references it for the upload-staging behavior of the composer and the pill rendering inside a message.

## Data Shape

Two types — one for runtime, one for persistence. Both live in `lib/chat/types.ts`. Adding fields goes as optionals. Path is derived, not stored.

### Runtime: `ChatAttachment`

```ts
export interface ChatAttachment {
  name: string // original display name as uploaded, e.g. "Q4 Report.pdf"
  slug: string // upload directory name (stable id), e.g. "q4-report-pdf-<uuid>"
}
```

Used on `ChatMessage.attachments: ChatAttachment[]` and as the argument shape across `chatStore` actions (`addUserMessage`, `sendMessage`, `setMessageAttachments`). The store carries one `attachments` array per message — no parallel `files` / `fileSlugs` arrays.

### Persisted: `ChatUploadRecord`

```ts
export interface ChatUploadRecord {
  name: string // original display name
  mimeType: string // captured at upload, not inferred from extension
  sizeBytes: number
  uploadedAt: string // ISO 8601
  extractedPath: string | null // ".chats/<sid>/uploads/<slug>/raw.txt" etc., or null
}
```

Written to `chat.json.uploads[slug]` at upload time by `lib/actions/ingestion.ts`. Read by `lib/chat/load-history.server.ts` to hydrate display names and metadata onto reloaded messages.

Legacy entries written before this spec are plain `string` (display name only). The loader reads both shapes — if the value is a string, treat it as `{ name: string }` with all other fields undefined; if it's an object, parse it as `ChatUploadRecord`. No migration shim — degrade gracefully.

### Path derivation

One helper, in one file. All callers go through it.

```ts
// lib/chat/upload-path.ts
import path from 'node:path'
import type { ChatAttachment } from '@/lib/chat/types'

export function chatAttachmentPath(
  sessionId: string,
  attachment: ChatAttachment,
): string {
  const ext = path.extname(attachment.name)
  return `.chats/${sessionId}/uploads/${attachment.slug}/original${ext}`
}

export function chatAttachmentSiblingPath(
  sessionId: string,
  slug: string,
  filename: string,
): string {
  return `.chats/${sessionId}/uploads/${slug}/${filename}`
}
```

If the upload layout ever changes (Electron sync, cloud blob store), this helper changes — not every call site.

## Lifecycle

### 1. Staging (composer)

Files are **staged locally** on drop, not uploaded immediately. The `Composer` holds client-side `StagedFile[]` (the `File` reference, display name, status) — stored in `chatStore.draftFiles` so they persist across floating/sidebar toggle. Rendered as `FileCard` components with hover-reveal remove buttons.

Two benefits:

- **Home screen uploads.** Files can be staged before any chat session exists (the session is created at send-time via `ensureSession()`).
- **No orphaned uploads.** Files dropped but never sent are never uploaded.

### 2. Upload + extraction (`lib/actions/ingestion.ts`)

At send-time, `useChatActions().send()` calls `uploadFile(sessionId, formData)` for each staged file. `uploadFile`:

1. Derives a kebab-case slug from the filename, with `-2`, `-3`, … collision suffixes within the session.
2. Writes the file to `.chats/{sessionId}/uploads/{slug}/original.{ext}`.
3. Runs eager extraction per type:
   - `.pdf` → `raw.txt` (via pdfium)
   - `.eml` → `email.json` + extracted attachment files
   - `.docx` → `content.md` + extracted image files
4. Records a `ChatUploadRecord` to `chat.json.uploads[slug]` with `name`, `mimeType` (from `file.type`), `sizeBytes`, `uploadedAt` (ISO 8601), and `extractedPath` (the sibling extracted-form path if extraction succeeded, else `null`).
5. Returns the slug.

The agent reaches files via the filesystem tools (`Read`, `Bash`), not multimodal content blocks — chosen because the agent classifies, moves, and processes files on disk (e.g., `setupTaskFromChat` moves uploads into a task's `inputs/`).

### 3. Optimistic render before upload completes

The pill should appear the moment the user hits send — not after `uploadFile()` resolves. But `slug` isn't known until upload completes. To keep the runtime shape strict (`slug: string`, never `null`), the flow is two-phase:

1. `useChatActions().send()` calls `chatStore.addUserMessage(content, attachments)` with attachments built from staged-file names and a temporary slug (e.g. the client-side `StagedFile.id`). `addUserMessage` returns the new message id.
2. After `uploadFile()` returns the real slug for each file, `send()` calls `chatStore.setMessageAttachments(messageId, attachments)` with the final `{ name, slug }` pairs.

The pill renders the same way in both phases; clicks during the in-flight window fall back to a "still uploading" state inside `FilePill` (slug starting with the staged-file id sentinel → disable the click + show a subtle spinner). Once the real slug lands, the pill becomes clickable.

This keeps `ChatAttachment` strict and avoids a nullable `slug` field that every reader would have to handle.

### 4. Marker injection (`stores/chatStore.ts`)

When the user sends a message with attachments, the store composes a marker `[Files uploaded: <slug1>, <slug2>]` appended to the API message body so the agent knows which slugs to read from `.chats/{sessionId}/uploads/`. The marker carries **slugs only** (extensionless) — the agent doesn't need display names, and keeping the wire format slugs-only avoids leaking display-name punctuation into a regex-parsed string.

The UI never renders the marker as text — it's stripped from the visible content and the attachments are surfaced separately on `ChatMessage.attachments`.

### 5. Live render

`ChatMessage.attachments: ChatAttachment[]` carries one entry per upload. The `UserMessage` component iterates and renders one `FilePill` per attachment.

`FilePill` accepts a `ChatAttachment` and:

- Picks an icon by **`mimeType` first** (looked up by `slug` against `chat.json.uploads`), falling back to file extension on `name` if the record is legacy or missing. Type buckets: PDF, Word (`.doc`, `.docx`), Email (`.eml`), Excel (`.xls`, `.xlsx`), Spreadsheet (`.csv`), generic File.
- Is a `<button>` — clicking opens the preview overlay (see below).
- Owns its own `Dialog` open state via local React state. No new Zustand store; no global modal manager. The heavy viewer content is lazy-imported and only mounted when `open=true`.

`sessionId` reaches `FilePill` via the existing `useChatSessionIdRef()` hook used elsewhere in the chat tree.

### 6. History round-trip

`parse-history.server.ts` extracts slugs from the `[Files uploaded: …]` marker on user entries and emits `attachments: [{ name: slug, slug }]` as a degraded placeholder. `load-history.server.ts` then reads `chat.json.uploads` and rewrites each attachment's `name` from the matching record:

- Object record → use `record.name`.
- Legacy string record → use the string as `name`.
- Missing entry → leave `name = slug` (the placeholder); the pill still renders, the original filename just isn't recoverable.

After this hydration, live and reloaded messages have identical `attachments` shape.

## Preview overlay

Clicking a `FilePill` opens a fullscreen-ish preview overlay over chat. The user reads the file in place and closes back to the same conversation. No navigation, no scroll loss.

### Shell

Radix `Dialog` (from `components/common/ui/dialog.tsx`). The pattern is ported from happyhq-archive's `ViewerModal` (`hq/components/layout/global-modal.tsx`, `view-attachment` modal type) — proven design we already built once.

- `DialogContent` sized `h-[95vh] sm:max-w-[97vw] p-0`, dark backdrop.
- Hover-revealed top chrome over the content: filename (left), close button + download link (right). Chrome fades in on `group-hover`.
- Escape and backdrop click close (free from Radix).
- State is local to `FilePill` — no store, no provider.

### Format routing

By `mimeType` first, falling back to file extension on `name` for legacy records. Each branch mounts the matching viewer **content** component from the existing desktop windows directory — the inner renderers are reusable outside the window frame.

| Mime / ext                                                                          | Component                                                                 | Source path                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `application/pdf` / `.pdf`                                                          | `PdfWindowContent`                                                        | `components/features/desktop/windows/pdf/content.tsx`        |
| `message/rfc822` / `.eml`                                                           | `EmailWindow` inner render (extract from window frame if coupled)         | `components/features/desktop/windows/email/email-window.tsx` |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` / `.docx` | `MarkdownWindowContent` reading sibling `content.md` from `extractedPath` | `components/features/desktop/windows/markdown/content.tsx`   |
| `text/csv` / `.csv`                                                                 | `CsvWindowContent`                                                        | `components/features/desktop/windows/csv/content.tsx`        |
| `image/*` / `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg`                             | bare `<img src="/api/fs/download?path={path}">`                           | n/a                                                          |
| `text/markdown` `text/plain` / `.md` `.txt`                                         | `MarkdownWindowContent` reading the path directly                         | as above                                                     |
| `application/vnd.ms-excel`, `…spreadsheetml.sheet` / `.xls` `.xlsx`                 | **download link only** (no viewer in v1)                                  | —                                                            |
| anything else                                                                       | **download link only**                                                    | —                                                            |

Path comes from `chatAttachmentPath(sessionId, attachment)`. Sibling artifact paths (`content.md`, `email.json`) come from `extractedPath` on the `ChatUploadRecord`, or by joining the slug dir with the conventional filename when the record is legacy/missing.

If any viewer content component is too tightly coupled to `WindowStore` meta (reads from `useWindowStore` instead of accepting props), refactor the inner render into a prop-driven component first — same shape, no behavior change for the desktop windows that still wrap it.

### Out of scope (v1)

- XLSX viewer — download fallback only.
- Image zoom controls (PDF viewer has its own zoom; image zoom is a follow-up).
- Arrow-key navigation between sibling pills.
- Mobile/narrow viewport variant — same overlay; responsive sizing handled by Radix defaults.

## Filesystem layout

```
.chats/{sessionId}/
  chat.json                                # uploads map: Record<slug, ChatUploadRecord | string>
  uploads/
    {slug}/
      original.{ext}                       # raw file
      raw.txt                              # PDF text extraction (if applicable)
      content.md                           # DOCX markdown extraction (if applicable)
      email.json                           # EML metadata (if applicable)
      <attachment-files>                   # EML/DOCX embedded attachments
```

Slug is the directory name and the stable id. `original.{ext}` is the only file with a predictable name; siblings vary by extraction path.

Future: a `.meta.json` inside each `{slug}/` mirroring `ChatUploadRecord` would make each upload self-describing on disk and remove the dependency on `chat.json` for hydration. Out of scope for this spec — track as a follow-up.

## Testing

Behavior contracts, not implementation details.

Server-side:

- [ ] `uploadFile` writes a `ChatUploadRecord` with `name`, `mimeType`, `sizeBytes`, `uploadedAt`, and `extractedPath` set correctly for PDF (`raw.txt`), DOCX (`content.md`), EML (`email.json`), and an unextracted type (e.g. CSV → `extractedPath: null`).
- [ ] `loadChatHistory` hydrates `name` from `chat.json.uploads`: object record (new) → uses `record.name`; string record (legacy) → uses the string; missing entry → leaves `name = slug`.
- [ ] `parseJournalEntries` emits `attachments: [{ name: slug, slug }]` from the `[Files uploaded: …]` marker.
- [ ] `chatAttachmentPath` returns `.chats/{sid}/uploads/{slug}/original{ext}` for a `ChatAttachment` with various extensions (including dotted names like `my.report.v2.pdf`).

Client-side:

- [ ] `chatStore.addUserMessage` accepts `attachments: ChatAttachment[]` and stores them on the new message. Returns the message id.
- [ ] `chatStore.setMessageAttachments(messageId, attachments)` replaces the attachments on the target message in place (used for the optimistic → real-slug transition).
- [ ] `chatStore.sendMessage` composes the marker `[Files uploaded: <slug1>, <slug2>]` from `attachments` and posts to `/api/chat`.
- [ ] During the upload window, a `FilePill` with an in-flight slug (staged-file id sentinel) renders disabled with a spinner; once `setMessageAttachments` lands the real slug, the pill becomes clickable.
- [ ] `FilePill` renders a mime-correct icon when the record carries mime; falls back to extension-based when not.
- [ ] Clicking a `FilePill` opens the preview overlay; the overlay closes on Escape and on backdrop click.
- [ ] Preview routing: PDF, image, markdown (DOCX via sibling `content.md`), CSV, email each mount the correct viewer content component.
- [ ] XLSX renders the download-only fallback (no crash, no missing viewer).
- [ ] After page reload, clicking a pill still opens the preview (history round-trip works).

## Design decisions

**Two-field runtime shape.** `ChatAttachment` keeps display name and stable id; everything else is derived (path) or persisted separately (mime, size, extracted form). Adding optionals (thumbnail, status) never breaks the shape. Tried `files: string[]` and the parallel-array `files` + `fileSlugs` approach — both produced "same field, two meanings" and silent drift bugs.

**Marker carries slugs only.** The agent doesn't need display names; keeping the wire format slugs-only avoids leaking display-name punctuation into the regex-parsed string and avoids redundancy with the chat.json source of truth.

**`chat.json.uploads` is the metadata source of truth.** All attachment metadata (mime, size, uploadedAt, extractedPath) is read from there. The slug remains a directory name + opaque id; we don't try to encode metadata into the slug string.

**Filesystem-mediated, not multimodal API blocks.** The agent acts on files (classify, move, ingest into streams) — not just reads them. Filesystem tools are the right primitive for action; multimodal blocks would force a two-track world. See [Chat Modes](chat-modes.md) and [Agent Configuration](agent-config.md) for the agent contract.

**Preview overlay state is local.** One `Dialog` per `FilePill`, owned by local React state. No new Zustand store for a single-feature UI — the existing pattern in this codebase is to add a generic UI store if multiple features need coordinated modals, not to add per-feature stores.

**Reuse archive's `ViewerModal` pattern.** `h-[95vh] × ~97vw` Radix DialogContent with hover-revealed chrome is the design we already built and validated in happyhq-archive (`hq/components/features/memories/detail-panel/fullscreen/`). The mime-routed content components are happyhq-current's contribution; the shell is ported.

## Cross-references

- [Chat](chat.md) — the conversational surface; references this spec for staging behavior in the composer and pill rendering inside a message.
- [Filesystem Layout](filesystem-layout.md) — `.chats/{sessionId}/uploads/{slug}/` directory contract.
- [Data Flow](data-flow.md) — `/api/fs/download` and `/api/fs/file` endpoints used by the preview viewers.
- [Agent Configuration](agent-config.md) — how the agent reads uploads via filesystem tools (filesystem-mediated, not multimodal).
