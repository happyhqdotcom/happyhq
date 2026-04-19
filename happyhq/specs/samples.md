# Samples

How Q ingests, annotates, and indexes sample files so Q can reference them during tasks.

## Purpose

Define the full lifecycle of samples — from the moment a user drops a file into chat to the moment Q references it during task execution. Samples are the highest-leverage teaching input: a finished deliverable gives Q something concrete to reverse-engineer. This spec owns intake, extraction, storage, INDEX.md format, and initial annotation.

This spec does not own enrichment. Initial annotations are best-effort based on what Q knows at intake time. As Q gains context — through the setup interview, from additional samples, from teaching — it improves annotations over time. That enrichment behavior belongs to the Learning spec, because it's the same classify-and-capture intelligence Learning applies everywhere else. The boundary: this spec knows what an INDEX.md looks like and creates the first version. Learning knows when and how to make it smarter.

For when and how Q encourages samples during the first session, see [Learning](learning.md). For where samples live on disk, see Filesystem Layout. For how samples fit into the broader classification system, see Learning.

## Filesystem Structure

Samples are organized by type. A user might have multiple SOW samples — they all live under `samples/sows/`. The structure is always consistent, even for a single sample.

```
samples/
  {type}/                          # e.g. sows/, reports/, proposals/
    INDEX.md                       # Catalogs all samples of this type
    {sample-name}/                 # e.g. acme-q4-status/
      original.{ext}               # User's file, renamed for predictability
      {extracted-form}             # Agent-readable extraction (varies by type)
```

Rules:

- **Always a type.** Even one SOW goes into `samples/sows/`. No conditional structure — Ralph never handles two different shapes for "where are the samples."
- **Always `original.{ext}`.** The directory name carries identity. Inside, predictable filenames mean agents always look for `original.*` without guessing. If the original filename matters for provenance, Q notes it in the INDEX.md annotation.
- **Extracted form alongside original.** The original is the source of truth. The extraction is a working copy for agents. The extracted form varies by input type (PDF → `raw.txt`, EML → `email.json`). See [Input Types](input-types.md) for the full list.

This structure is reflected in the Filesystem Layout spec.

## Intake Pipeline

Samples enter through two paths:

1. **Chat intake** — Users drop files into the chat interface. Q classifies them (sample vs. reference material), extracts text, assigns a type, and annotates in INDEX.md. This is the full-service path.
2. **Direct drop** — Users drag PDFs onto the Samples window. The sample lands immediately in `samples/other/{slug}/` with `original.pdf` + `raw.txt`. No Q involvement — the user's intent (dropping on the Samples window) signals classification. Type is assigned interactively via the right-click "Set Type" context menu. Q enriches INDEX.md annotations later during conversation.

Manual filesystem placement is not a supported intake path — it skips extraction and indexing, leaving files invisible to Q.

### Three-step flow

**1. Receive & Classify** — User drops file(s) into chat. Each file lands in its own directory under `.chats/{sessionId}/uploads/{slug}/` — scoped to the current chat session, one directory per upload (see [Filesystem Layout](filesystem-layout.md)). The file is renamed to `original.{ext}` inside the directory; if eager extraction ran on upload, `raw.txt` sits alongside it. Q peeks at each upload (lightweight — subagent reads `raw.txt` if available, otherwise first page via pdftotext on `original.*`), considers the user's accompanying message and conversation context, and proposes how to handle it. **Not every PDF is a sample.** A sample is an example of the output Q produces (a finished SOW, a completed report). Reference documents — policies, guidelines, methodology docs, pricing matrices — contain rules to incorporate into specs and go through the teaching flow, not the sample pipeline. Only files the user confirms as samples of the output continue to step 2. See [Learning](learning.md) for the full file classification behavior. Q never auto-processes uploads as samples.

**2. Extract** — Q calls the `ProcessSample` MCP tool (see [Agent Configuration](agent-config.md)) with `{ slug, type, name }`. The tool handles the full pipeline deterministically:

1. Validates the upload directory exists at `.chats/{sessionId}/uploads/{slug}/` and contains `original.*`
2. Validates the original file is a PDF (only supported intake format — returns an error for non-PDF files)
3. Moves the upload directory to `samples/{type}/{name}/` (atomic rename — the directory already contains `original.{ext}` and potentially `raw.txt`)
4. Extracts text using pdfium (reads `raw.txt` if it already exists from eager extraction on upload — see Design Decisions; falls back to running pdfium on `original.pdf` if missing)
5. Writes `raw.txt` (if not already present from eager extraction)

pdfium (`@hyzyla/pdfium`) extracts text directly — no intermediate reformatting step needed. Raw pdfium output is clean enough for LLM consumption: proper line breaks, ~10% fewer tokens than pdftotext, no spatial whitespace noise. The extracted text goes straight into `raw.txt` as the final artifact.

Once `raw.txt` exists, it immediately becomes Q's working material for the conversation — not just a file for Q to reference during tasks. Q reads the extraction to analyze the sample's structure, patterns, and content, then uses what it finds to drive follow-up questions (see [Learning](learning.md) for samples-first interview behavior).

**3. File** — Q names the type and sample (passed to `ProcessSample` in step 2), then writes or updates the INDEX.md. Q acts autonomously here — no propose-and-confirm. Q announces what it did:

- "I've added this to your report samples as `acme-q4-status`."
- If a type already exists: "I've added this to your existing report samples."

Type and directory names follow filesystem conventions — kebab-case, self-explanatory, no special characters.

Q commits the new sample to git after filing is complete (see [Git Layer](git-layer.md)). Sample intake during the first session is included in the single initial commit rather than committed individually.

## INDEX.md — Curated Metadata

One INDEX.md per type directory. It catalogs all samples of that type with curated annotations that tell Q when and why to reference each one.

### Format

```markdown
# Weekly Report Samples

Reference these for structure, tone, and section patterns.

## acme-q4-status/

Final weekly client status report (Nov 2025). Written for a non-technical audience. Good reference for executive summary format, risk/blocker escalation, and progress table layout. Uses traffic-light indicators (green/amber/red) for metrics. Note: includes a custom "Client Actions" section that's client-specific, not standard.

## northstar-replatform/

Final weekly program status report (Jan 2026). Multi-workstream rollup for a steering committee. Longer format (3 pages vs typical 1-page). Good reference for dependency tracking between teams and milestone timeline format.
```

### Annotation style

Freeform prose — no structured fields (no "Good for" / "Note" / "Caution" schema). Q writes whatever is useful about each sample in its own words. The key information to capture: what patterns to learn from this sample, relevant context, and any edge cases or exceptions. Q updates annotations as it learns more — initial annotations are minimal, enriched over time through conversation.

### Initial vs. enriched annotations

At intake time, Q writes what it can see from the file alone — a minimal but useful entry. "Weekly status report, final, Nov 2025." The really valuable annotations — "Good for: executive summary format, risk escalation pattern" and "Caution: client-specific section, not standard" — require Q to understand the stream's context. Q doesn't know what's standard vs. exceptional until it's seen multiple samples or had the interview conversation.

Enrichment happens naturally: during setup (Q already has the conversation context), when new samples arrive (Q can now compare), and during ongoing teaching. This behavior belongs to the Learning spec — it's the same intelligence that improves playbooks and specs, just writing to INDEX.md.

## Format Handling

PDF is the only supported intake format. The extraction pipeline (pdfium text extraction) is built and tested for PDFs. Other formats can be added incrementally.

### PDFs

pdfium extracts text from the PDF, `raw.txt` is written alongside `original.pdf`.

## User Corrections

Through chat teaching, consistent with everything else. "Actually that report format is our standard, not a one-off" → Q updates the INDEX.md.

Direct file editing works naturally — it's markdown on disk, and Q reads current state. But it's not a supported intake path, just a side effect of the architecture.

## Design Decisions

**Type-based organization rather than flat listing.** Types group related samples so Q can find all samples of a given output type together. Even one sample gets a type — consistent structure means no conditional logic for agents. The INDEX.md at the type level provides a curated catalog rather than forcing Q to open every sample directory.

**pdfium text extraction rather than pdftotext or LLM reformatting.** `@hyzyla/pdfium` (MIT, Chrome's PDFium engine via WASM) runs in-process — no system binary dependency, no GPL licensing concerns. Produces cleaner output than `pdftotext -layout` (proper line breaks, no spatial whitespace noise, ~10% fewer tokens). Raw pdfium output is directly comprehensible by LLMs — no Sonnet reformatting step needed, saving cost ($5-10 per large PDF), latency (30-60s), and complexity.

**Predictable internal filenames (`original.{ext}`, `raw.txt`) rather than preserving user filenames.** Agents can always find `original.*` and `raw.txt` without guessing. The directory name carries the sample's identity. Original filenames, if they matter for provenance, go in the INDEX.md annotation.

**Initial annotations as best-effort rather than blocking on completeness.** A minimal INDEX entry ("Weekly status report, final, Nov 2025") is useful immediately. Waiting for rich annotations before filing the sample would block the intake flow. Enrichment happens naturally as Q gains context — the same way playbooks and specs improve over time.

**Two intake paths: chat and direct drop.** Chat intake provides full-service classification, typing, and annotation by Q. Direct drop onto the Samples window provides a low-friction path for users who already know they're adding a sample — extraction runs immediately, sample lands in "other", and type is assigned interactively via the right-click context menu. Q enriches annotations later. Manual filesystem placement is still not supported — it skips extraction entirely.

**Q names and types autonomously.** Q reads the file, has conversation context, and makes a good call. Q announces what it did rather than asking for permission — one fewer round-trip per sample. The user can correct through chat if Q gets it wrong.

**Chat-scoped, directorized uploads.** Each uploaded file gets its own directory under `.chats/{sessionId}/uploads/{slug}/`, scoped to the chat session. The slug is kebab-cased from the original filename minus extension (e.g., `Acme Report.pdf` → `acme-report/`). Inside: `original.{ext}` (renamed for predictability, matching the samples convention) and derived artifacts like `raw.txt`. This structure means ProcessSample moves a directory instead of copying individual files — one atomic rename from `uploads/{slug}/` to `samples/{type}/{name}/`. It also means future input types (DOCX, images, etc.) can add their own derived artifacts without changing the staging structure. Stream-scoped staging caused cross-chat scan pollution and orphan accumulation; chat-scoping isolates each conversation's files. Samples remain stream-scoped after processing.

**Eager text extraction on upload.** pdfium runs in `uploadFile()` for PDFs, storing `raw.txt` inside the upload directory (`.chats/{sessionId}/uploads/{slug}/raw.txt`). Text is ready before Q sees the file. The preamble peek subagent reads `raw.txt` instead of running extraction. ProcessSample reads it instead of re-extracting (falls back to on-demand if `raw.txt` is missing). Failure in eager extraction is non-blocking — the upload succeeds regardless.

## Acceptance Criteria

- [x] User can drop files into chat and Q processes them through the intake pipeline
- [x] pdfium extracts text from PDFs; `raw.txt` written alongside original
- [x] Original file is stored as `original.{ext}` — predictable naming
- [ ] Q names the type and sample autonomously (announces, does not ask for confirmation)
- [x] Type directory is created even for a single sample
- [ ] INDEX.md is created or updated with an annotation entry for the new sample
- [ ] INDEX.md annotations include at minimum a useful description of the sample
- [x] Non-PDF files are rejected with a clear message explaining supported formats
- [ ] User can correct INDEX.md annotations through chat teaching
- [x] Q can find and read INDEX.md files to discover relevant samples
- [x] Q can read `raw.txt` for agent-friendly sample content

## Testing

ProcessSample input validation (`lib/agents/tools.server.test.ts`):

- [x] Rejects non-PDF files with error message (`lib/agents/tools.server.test.ts`)
- [x] Rejects missing files (not in uploads/) (`lib/agents/tools.server.test.ts`)
- [x] Case-insensitive .pdf extension matching (`lib/agents/tools.server.test.ts`)

Not tested:

- [ ] Full intake pipeline execution (move upload directory to samples/, extract text with pdfium, write raw.txt) — ProcessSample tool test validates inputs but the pipeline runs inside the MCP tool handler
- [ ] INDEX.md generation and format

## Edge Cases

- **User drops multiple files at once**: Q processes each through the pipeline. When multiple samples are confirmed, Q fires ProcessSample calls in parallel — one per sample — via parallel tool calls or subagents (subagents inherit MCP tools). If they belong to the same type, Q files them together and writes one INDEX.md with multiple entries. If different types, Q files each and announces.
- **User drops a file that matches an existing sample name**: Q flags the collision — "You already have a sample called acme-q4-status. Is this a replacement or a different version?" Let the user decide.
- **Extraction produces garbage**: Q should recognize when extracted text is unusable (e.g., scanned PDF with no OCR). Treat as unconvertible — keep original, note in INDEX, don't write a bad `raw.txt`.
- **User disagrees with Q's type assignment**: Q moves the sample to the correct type. No argument.
- **User drops a non-PDF file**: Q explains that PDF is the only supported format for now and asks the user to convert it or provide a PDF version.
- **Type has only one sample and user adds a second**: Q updates the existing INDEX.md — adds a new entry. No structural change needed because the type already exists.
- **User wants to remove a sample**: No sample deletion from the UI. Delete directories in Finder.

## Constraints

- Intake is via chat or direct drop on the Samples window. No filesystem watching or manual placement support.
- PDF is the only supported intake format.
- All knowledge files are plain markdown on the filesystem (see Filesystem Layout spec).
- Chat sessions are SDK-persisted (see [Agent Configuration](agent-config.md)). Q can also read existing INDEX.md files to understand current sample state independently of conversation history.
- Q in learning mode (Agent Config) powers intake conversations. This spec defines the behavior; Agent Config defines the technical configuration.
- Extraction uses `@hyzyla/pdfium` (WASM, runs in-process). No system binary dependency.

## Cross-References

- [Learning](learning.md) — When and how Q encourages samples during the first session; INDEX.md enrichment
- [Learning](learning.md) — How samples fit into knowledge classification; INDEX.md enrichment over time
- [Filesystem Layout](filesystem-layout.md) — Directory conventions
- [Chat](chat.md) — File drop mechanics in the chat UI
- [Agent Configuration](agent-config.md) — Q access to sample files
