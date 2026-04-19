# Templates

How users create, share, and use stream templates.

## Purpose

Templates are packaged, shareable starting points for streams. They let new users start fast ("I want to write a SOW"), let experienced users share what they've built ("Here's how we do retros"), and eventually let creators build a following around their domain expertise. This is the Figma Community / v0 model applied to streams — discovery, distribution, and network effects.

Templates are the answer to "What do you want to accomplish today?" — a guided start experience alongside the blank-slate composer.

## Related Specs

- [Home](home.md) — Where templates surface as a starting experience
- [Filesystem Layout](filesystem-layout.md) — Stream structure that templates scaffold
- [Learning](learning.md) — How Q teaches and builds stream knowledge (templates skip/accelerate this)
- [Samples](samples.md) — Sample artifacts that may be included in templates
- [Accounts](accounts.md) — User identity for authoring templates
- [Billing](billing.md) — Free tier limits on streams (templates create streams)

## What Is a Template?

A template is a snapshot of a stream's knowledge — everything Q needs to start doing work, without the user teaching from scratch.

### Template Contents

| Artifact      | Required | Description                                                       |
| ------------- | -------- | ----------------------------------------------------------------- |
| `playbook.md` | Yes      | The workflow — steps, approach, methodology                       |
| `specs/`      | No       | Detailed standards, rules, preferences (zero or more `.md` files) |
| `samples/`    | No       | Example outputs (`extracted.md` only — no original files)         |
| `metadata`    | Yes      | Name, description, author, tags                                   |

A template does NOT include:

- Tasks, outputs, or working artifacts (those are run-specific)
- Chat history
- Original sample files (only the LLM-extracted markdown — keeps templates lightweight and avoids IP concerns)
- User-specific context or private data

### Minimum Viable Template

Just a `playbook.md` and metadata. A template can be useful with nothing but a good playbook — specs and samples make it better but aren't required.

### Attribution Metadata

Templates carry lightweight attribution that persists into the stream:

```json
{
  "name": "Statement of Work",
  "description": "Generate a professional SOW from a project brief and client requirements.",
  "author": {
    "name": "HappyHQ",
    "email": "team@happyhq.com"
  },
  "tags": ["consulting", "client-work", "project-management"],
  "createdAt": "2026-01-15T00:00:00Z"
}
```

No versioning for now. Templates are snapshots. If the author improves their stream and wants to update the template, they re-export.

## Creating a Template

A user with a working stream can turn it into a template.

### Flow

1. User opens stream settings and clicks "Create Template"
2. **Export screen** shows what will be included:
   - Playbook (always included)
   - Specs (listed — user can deselect individual specs)
   - Samples (listed as extracted.md only — user can deselect; originals are never included)
3. User fills in metadata: name, description, tags
4. User clicks "Create"
5. Template is packaged — a single portable file (JSON with embedded content)

### What Gets Exported

The export strips a stream down to reusable knowledge:

- `playbook.md` — as-is
- `specs/*.md` — as-is (user can exclude specific specs)
- `samples/*/extracted.md` — extracted text only, never original files
- Metadata — user-provided name, description, tags + auto-populated author info from their account

### Trust Model

Users are responsible for what they share, same as Figma. The export screen shows exactly what will be included — no hidden files, no surprise inclusions. Original sample files (PDFs, etc.) are never included, which provides a baseline of IP protection. If users request more granular controls (redacting sections, reviewing extracted content), we add them based on demand.

## Sharing a Template

Three tiers of sharing, each building on the previous. Ship all three, in order — but file export stays available permanently. It's not a stepping stone to links; it's a feature in its own right. Your files are yours.

### Tier 1: File Export (v0)

The template is a downloadable file. Always available, even after Tiers 2 and 3 ship.

- User creates a template (see above) and gets a `.json` file (or similar portable format)
- They share it however they want — Slack, email, Dropbox, whatever
- Another user imports it into their Q to create a stream

This requires zero cloud infrastructure. The template is self-contained. It also reinforces a core principle: your data isn't locked in. If you want to take your template and leave, you can. If you want to share it without going through our platform, you can.

### Tier 2: Shareable Link

Generate a private link for the template. Anyone with the link can use it.

- User creates a template and clicks "Get Link" instead of (or in addition to) downloading
- Link resolves to a hosted copy of the template
- Visiting the link lets you import the template into your Q
- Not discoverable via search or browse — only accessible via direct link

This is the "unlisted YouTube video" model. Good for team sharing, client sharing, or sharing on social media without putting it in a public directory.

**InstantDB fit:** InstantDB has a first-class "share links" pattern via `ruleParams`. A `templateLinks` namespace stores secrets; permission rules check `ruleParams.secret in data.ref('templateLinks.secret')` to grant access. This means shareable links are just a permission rule — no separate sharing infrastructure needed. The HappyHQ team has experience with InstantDB's sharing model (one record per grantee), and the admin SDK is available for server-side writes. Accounts ships before templates (see [Accounts](accounts.md)), so InstantDB will already be integrated into Q by the time this lands.

Sketch of the data model:

```
templates (InstantDB namespace)
  - id, name, description, tags, visibility ('link' | 'public')
  - content: { playbook, specs[], samples[] } (JSON)
  - author → $users
  - created_at, updated_at

templateLinks (InstantDB namespace)
  - secret (unique, indexed)
  - template → templates
  - created_at
```

Permission rules:

```json
{
  "templates": {
    "bind": {
      "isAuthor": "auth.ref('$user.id') == data.author",
      "isPublic": "data.visibility == 'public'",
      "hasLink": "ruleParams.secret in data.ref('templateLinks.secret')"
    },
    "allow": {
      "view": "isAuthor || isPublic || hasLink",
      "create": "auth.id != null",
      "update": "isAuthor",
      "delete": "isAuthor"
    }
  },
  "templateLinks": {
    "allow": {
      "view": "false",
      "create": "auth.ref('$user.id') == data.ref('template.author')",
      "delete": "auth.ref('$user.id') == data.ref('template.author')"
    }
  }
}
```

Template content (playbook markdown, specs, extracted samples) is embedded as JSON fields in the InstantDB record — no separate file storage needed for v0. If templates get large (many samples), content can move to InstantDB `$files` storage later.

### Tier 3: Public Marketplace

Public discovery, browsing, and curation.

- User publishes a template to the public marketplace
- Templates are browsable, searchable, and discoverable by all users
- Featured/staff-picked sections
- Usage counts ("Used by 142 teams")
- Author profiles
- Eventually: paid templates, revenue split, domain-specific template creators building a business

This is the full Figma Community / v0 vision. It depends on what we learn from Tiers 1 and 2. The InstantDB data model above already supports this — flipping `visibility` from `'link'` to `'public'` makes a template discoverable.

## Using a Template

### From a File (Tier 1)

1. User has a template file (received via Slack, email, etc.)
2. User imports it — either drag-and-drop onto Q or via an "Import Template" action
3. New stream is created with template contents copied in
4. User lands in the stream, ready to work

### From a Link (Tier 2)

1. User clicks a shareable template link
2. If logged in: stream is created immediately from the template
3. If not logged in: prompted to sign up/log in, then stream is created
4. User lands in the stream, ready to work

### From the Marketplace (Tier 3)

1. User browses templates on the home page or a dedicated browse page
2. Clicks a template card
3. Stream is created immediately — no preview gate, no "are you sure?" screen
4. User lands in the stream, ready to work

Creating a stream is cheap and reversible. If the template isn't what they wanted, they delete the stream. No friction needed.

### What Happens After Import

The new stream is identical to one built by hand through teaching. Q has the same context and can work the same way. The difference: the user didn't spend time teaching Q — the template did it for them.

Q may notice the stream was created from a template (via attribution metadata) and use judgment about whether to offer customization — "Want to swap in your own samples?" or "Anything you'd like to adjust before we start?" This is not a rigid onboarding wizard. It's Q being smart with the Agent SDK, reading the context, and deciding whether a quick check-in is helpful. Some templates might benefit from it (a SOW template where Q asks "What's your company name?"), others won't (a blog post template where you just start writing).

## Discovery

### Home Page (v0)

Templates surface on the home page below the composer:

```
+--------------------------------------------------+
|                                                   |
|   Good afternoon                                  |
|   What should we work on?                         |
|                                                   |
|   +---------------------------------------------+ |
|   |  Tell Q about your process...               | |
|   |                                       [Send] | |
|   +---------------------------------------------+ |
|                                                   |
|   Or start from a template                        |
|                                                   |
|   +----------+ +----------+ +----------+          |
|   | SOW      | | Weekly   | | Retro    |          |
|   |          | | Review   | |          |          |
|   +----------+ +----------+ +----------+          |
|   +----------+ +----------+ +----------+          |
|   | Product  | | All      | | Invest-  |          |
|   | Shaping  | | Hands    | | ment Memo|          |
|   +----------+ +----------+ +----------+          |
|                                                   |
+--------------------------------------------------+
```

Composer stays primary — templates are below it, not replacing it. Users who know what they want can type immediately.

For v0, these are HappyHQ-authored templates seeded into the system. They're created using the same template system users will use — HappyHQ is just the first author.

### Future Discovery

- Dedicated `/templates` browse page with search, filter, sort
- Community tab in the sidebar
- Categories and/or tags for filtering (taxonomy TBD — evolve based on what templates actually get created)
- Featured/trending sections

## Filesystem Impact

When a template is used to create a stream, the resulting directory structure is identical to a manually-built stream:

```
~/HappyHQ/
  {stream-slug}/
    playbook.md                    # From template
    specs/                         # From template
      {topic}.md
    samples/                       # From template (if included)
      {type}/
        INDEX.md
        {sample-name}/
          extracted.md             # Extracted text only (no original.{ext})
    .meta/
      template-origin.json         # Attribution — author, description, source
```

The `.meta/template-origin.json` file stores minimal attribution:

```json
{
  "name": "Statement of Work",
  "description": "Generate a professional SOW from a project brief and client requirements.",
  "author": {
    "name": "HappyHQ",
    "email": "team@happyhq.com"
  },
  "importedAt": "2026-03-07T14:30:00Z"
}
```

This file is read-only context. Q can reference it to understand the stream's origin. The stream otherwise has no connection to the source template — it's a standalone stream that diverges immediately.

## API / Server Actions

### v0 (File Export/Import)

| Action                                           | Description                                        |
| ------------------------------------------------ | -------------------------------------------------- |
| `createTemplateFromStream(streamSlug, metadata)` | Package a stream's knowledge into a template file  |
| `importTemplate(file)`                           | Create a new stream from an imported template file |

`createTemplateFromStream` reads the stream's playbook, specs, and selected samples, bundles them with metadata into a portable JSON file.

`importTemplate` parses the template file, creates a new stream (reusing existing `createStream()`), and copies the template contents into the stream directory.

### Future (Links + Marketplace)

| Action                          | Description                                        |
| ------------------------------- | -------------------------------------------------- |
| `publishTemplate(templateData)` | Upload a template to the registry (link or public) |
| `getTemplates(filters?)`        | List/search published templates                    |
| `getTemplate(id)`               | Get a single template with full contents           |
| `useTemplate(id)`               | Create a stream from a published template          |
| `unpublishTemplate(id)`         | Remove a published template                        |

## HappyHQ Seed Templates

The first templates are authored by HappyHQ to populate the home page and demonstrate the system. These are created using the same tooling users will use — no special infrastructure.

Starting set (refined through user feedback):

1. **Statement of Work** — Generate a SOW from project brief and requirements
2. **Weekly Review** — Summarize the week's progress, blockers, and plans
3. **Product Shaping** — Shape a feature from raw idea to buildable pitch
4. **Retrospective** — Run a structured retro and produce action items
5. **Team All Hands** — Prepare an all-hands agenda and talking points
6. **Investment Memo** — Analyze a company/opportunity for investment

Each needs a well-crafted playbook that Q can follow immediately. Specs and samples are optional but make templates dramatically more useful.

## Acceptance Criteria

### v0 (File Export/Import)

- [ ] User can create a template from a stream via stream settings
- [ ] Export screen shows playbook, specs, and samples with ability to deselect
- [ ] User provides name, description, and tags as metadata
- [ ] Template is exported as a portable file (JSON)
- [ ] User can import a template file into Q
- [ ] Import creates a new stream with template contents copied in
- [ ] New stream from template is identical in structure to a manually-built stream
- [ ] Attribution metadata (author, description) is stored in the stream
- [ ] Templates do not include tasks, outputs, chat history, or original sample files
- [ ] Home page shows HappyHQ seed templates below the composer
- [ ] Clicking a seed template creates a stream immediately (no preview gate)
- [ ] "Start from scratch" (using the composer directly) still works as before

### Future (not blocking v0)

- [ ] Shareable links for templates
- [ ] Public marketplace with browse/search
- [ ] Usage tracking, social features
- [ ] Paid templates

## Open Questions

1. **Template file format**: JSON with embedded markdown content? A zip with actual files? JSON is simpler and matches the InstantDB storage model; zip preserves directory structure more naturally for offline use.
2. **Import UX**: Drag-and-drop? A file picker? An "Import" button somewhere in the UI? All of these?
3. **Q's template awareness**: How much should Q's prompt know about template origin? Enough to offer a quick customization check-in, or just ignore it?
4. **Home page template count**: How many seed templates show before it feels overwhelming? 6? 8?
5. **Categories/tags taxonomy**: Define upfront or let it emerge from what templates get created?
6. **`.meta/` directory**: Is this the right place for template attribution, or should it live elsewhere in the stream structure?
7. **Template size limits**: Should there be a max size for exported template files? Relevant once samples are included.
8. **File export format details**: What does the `.json` file look like exactly? Should it be human-readable (pretty-printed markdown fields) or compact? Should it include a schema version for forward compatibility?

## Cross-References

- [Home](home.md) — Template grid integration on the home page
- [Filesystem Layout](filesystem-layout.md) — Stream directory structure that templates produce
- [Learning](learning.md) — Templates skip the teaching phase; Q already has playbook + specs + samples
- [Samples](samples.md) — Sample extraction format used in templates
- [Accounts](accounts.md) — User identity for template authorship
- [Billing](billing.md) — Free tier limits apply to template-created streams
