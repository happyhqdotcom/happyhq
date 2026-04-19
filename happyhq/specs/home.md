# Home

The home page — greeting and composer.

## Purpose

The home page (`/`) is the single entry point for all work. A warm greeting and a composer that can create new streams (with AI-generated names) or start a new chat in an existing stream. No template gallery — the focus is on getting started immediately.

## Related Specs

- [App Shell](app-shell.md) — Routing, stream creation, app launch
- [Sidebar](sidebar.md) — Global sidebar, stream list
- [Chat](chat.md) — Chat surface, composer component
- [Data Flow](data-flow.md) — SWR patterns, Zustand stores, server actions

## Layout

Vertically centered: greeting and composer sit in the upper-center of the viewport. No scrolling content below.

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│                                                 │
│   Good afternoon 🌤️                             │
│   What should we work on next?                  │
│                                                 │
│   ┌─────────────────────────────────────────┐   │
│   │  Tell Q about your process...           │   │
│   │                                         │   │
│   │  [+]  [Work on ▾ something new]  [Send] │   │
│   └─────────────────────────────────────────┘   │
│                                                 │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

Outer container: `flex h-svh flex-col overflow-y-auto border-l border-black/10`. The `border-l` preserves the visual boundary between the sidebar and the content area.

Content uses a flexbox centering pattern: a `min-h-[70vh]` wrapper with `flex-3` spacer above and `flex-2` below, pushing the content into the upper third. Greeting and composer are constrained to `max-w-3xl` centered with horizontal padding.

## Greeting

A time-of-day greeting with an emoji, plus a call-to-action sub-message.

**Time-of-day logic:**

- Before 12:00 → "Good morning ☀️"
- 12:00–16:59 → "Good afternoon 🌤️"
- 17:00+ → "Good evening 🪐"

Uses `new Date().getHours()` at render time — no effect or interval needed. The `getGreeting()` function returns `{ text, emoji }`.

**Sub-message:** A fixed heading beneath the greeting: "What should we work on next?"

**Styling:** Uses `font-display` with responsive sizing. The greeting line (`text`) is `text-lg sm:text-xl`, and the sub-message (`h1`) is `text-2xl font-medium sm:text-[28px] md:text-[32px]`. Both left-aligned within the centered container.

## Composer

Reuses the existing `Composer` component (`components/features/chat/composer.tsx`) in its default card mode (not compact). Wrapped by a `HomeComposer` component that handles stream creation, stream selection, and navigation. Supports file uploads via the same deferred staging pattern as chat — files are held as client-side `StagedFile[]` objects until send-time, when they are uploaded after the stream and session are created (see [Chat](chat.md) "File Upload — Deferred Staging Pattern").

**Props passed to Composer:**

- `onSubmit` → the stream-creation/chat-start handler (see Data Flow below)
- `placeholder` → `""` (empty — the animated placeholder overlay handles display)
- `autoFocus` → `true`
- `disabled` → `true` while creating or while streams store is loading
- `onValueChange` → tracks whether the input is empty (controls placeholder visibility)
- `overlay` → `<AnimatedPlaceholder>` — typing animation shown when empty and not disabled
- `actions` → `<StreamContextSelector>` — dropdown for choosing existing stream or "something new"

**Visual:** The composer sits inside a `max-w-3xl w-full` container. Outer wrapper applies styling via child selectors: `bg-muted`, border, shadow, and ring effects for the card appearance.

### Animated Placeholder

Instead of a static placeholder string, the composer shows a typing animation that cycles through context-aware phrases. Implemented as an `overlay` prop on the Composer — an absolutely positioned `<span>` that appears when the input is empty.

**Phrases for new streams** (no stream selected):

- "Hey Q! We can't keep up with..."
- "Hey Q! Let me tell you how we..."
- "Hey Q! I wish there was a faster way to..."
- "Hey Q! Can you learn how we do..."

**Phrases for existing streams** (stream selected):

- "Hey Q! Let's start a new task..."
- "Hey Q! Let's add another output..."
- "Hey Q! Let's tweak the approach..."
- "Hey Q! Learn from this example..."

The `useTypingPlaceholder` hook manages the animation cycle:

- **TYPE_SPEED:** 40ms per character
- **DELETE_SPEED:** 25ms per character
- **PAUSE_AFTER_TYPE:** 2500ms
- **PAUSE_AFTER_DELETE:** 400ms

**Smart prefix retention:** When deleting, the animation only deletes back to the common word-boundary prefix between the current and next phrase — not all the way to empty. For example, "Hey Q! " always stays visible, and "Hey Q! Let's " stays visible when consecutive phrases both start with "Let's". A `commonWordPrefixLength` helper computes the shared prefix snapped to the last space boundary.

The placeholder is hidden when the user types or when the composer is disabled.

### Stream Context Selector

A Catalyst `Dropdown` rendered in the composer's `actions` slot. Lets the user choose whether to create a new stream or start a chat in an existing one.

**Button text:** `"Work on {streamName}"` when a stream is selected, `"Work on something new"` when nothing is selected (default).

**Dropdown contents:**

- **Recents section:** Lists all existing streams from `useStreams()`. Each shows `formatSlug(stream.name)` with a checkmark if selected.
- **Divider** (if streams exist)
- **"Something new" option:** Deselects any stream, returning to new-stream mode.

The selected stream changes the animated placeholder phrases and determines the submit behavior (new stream vs. existing stream).

## Composer → Stream Data Flow

The home composer supports two flows: creating a new stream or starting a chat in an existing stream. Both store a pending message in `sessionStorage` for handoff to the chat page.

### New Stream (no stream selected — default)

1. User types a message and presses Enter (or clicks send).
2. `HomeComposer` generates a session ID: `crypto.randomUUID()`.
3. `HomeComposer` sets `isCreating` to disable the composer and prevent double-submit.
4. Uses the session ID as the temp slug (reuses the UUID from step 2).
5. Calls `createStream(tempSlug)` and `createChatSession(sessionId, tempSlug)` in parallel with `Promise.all`.
6. Optimistically adds the stream to `streamsStore`:
   - Inserts a `StreamEntry` with `name: tempSlug` at the front of the streams array via `setStreamsData()`.
7. Writes `q-home-message` to `sessionStorage`: `{ slug: tempSlug, sessionId, message }` — consumed by `ChatSessionProvider` on mount.
8. Navigates to `/chat/{sessionId}` via `router.push()`.

### Existing Stream (stream selected via dropdown)

1. User selects a stream from the `StreamContextSelector` dropdown.
2. User types a message and submits.
3. `HomeComposer` generates a session ID and sets `isCreating`.
4. Calls `createChatSession(sessionId, selectedStream)` only — the stream already exists.
5. Writes the pending message to `sessionStorage` (same format, using `selectedStream` as slug). No rename needed — existing streams already have names.
6. Navigates to `/chat/{sessionId}` via `router.push()`.

### Message Pickup

On the chat page, `ChatSessionProvider` checks for a pending home message on mount:

```typescript
// In ChatSessionProvider, BEFORE the existing load-history useEffect:
useEffect(() => {
  const raw = sessionStorage.getItem('q-home-message')
  if (!raw) return
  try {
    const { slug, sessionId, message } = JSON.parse(raw)
    if (slug !== streamSlug) return
    sessionStorage.removeItem('q-home-message')
    sessionIdRef.current = sessionId
    store.getState().sendMessage({
      message,
      sessionId,
      streamSlug: slug,
    })
    desktopStore?.getState().setIslandMode('chat')
  } catch {
    sessionStorage.removeItem('q-home-message')
  }
}, [streamSlug, sessionIdRef, store, desktopStore])
```

**Effect ordering matters:** This effect must be declared before the load-history effect so React runs it first. Setting `sessionIdRef.current` causes the history effect to early-return, preventing a redundant `loadHistory` call for the empty new session. The `setIslandMode('chat')` call auto-opens the dynamic island so the user sees their message immediately.

**Why sessionStorage?** Simplest mechanism to pass a message across a full-page navigation without URL pollution or global state coupling. The key is consumed once and cleared immediately.

**Why not `useChatActions`?** The `useChatActions` hook depends on `useDesktopStore` being hydrated, which only happens on the `/{stream}` route (via `DesktopDataProvider`). The home page renders outside that boundary, so `HomeComposer` calls the server actions directly.

**Error handling:** If `createStream()` or `createChatSession()` fails, show a `toast.error()` via Sonner and re-enable the composer. The error message is context-sensitive: "Failed to create stream" for new streams, "Failed to start chat" for existing streams. Don't navigate on error.

## Component Structure

```
components/features/home/
  home-page.tsx                    # Main page shell — layout, composes greeting + composer
  greeting/
    greeting.tsx                   # Time-of-day greeting with emoji
    greeting.test.tsx              # Greeting unit tests
  home-composer/
    home-composer.tsx              # Wraps Composer with stream creation/selection logic
    stream-context-selector.tsx    # Catalyst dropdown for choosing stream or "something new"
    animated-placeholder.tsx       # Typing animation overlay component
    use-typing-placeholder.ts     # Hook managing type/delete animation cycle
    home-composer.test.tsx         # HomeComposer unit tests

```

`app/page.tsx` is a thin wrapper:

```tsx
'use client'
import { HomePage } from '@/components/features/home/home-page'
export default function Home() {
  return <HomePage />
}
```

The `HomePage` component renders inside the existing root layout (`app/layout.tsx`), which provides `SidebarProvider`, `StreamsDataProvider`, `GlobalSidebar`, and `SidebarInset`. No new providers needed.

**Loading state:** `HomeComposer` reads `useStreamsLoading()` from `streamsStore` to disable the composer while streams are being fetched. The greeting renders immediately.

## Acceptance Criteria

- [x] Home page shows greeting and composer on `/` regardless of whether streams exist
- [x] Greeting changes by time of day: "Good morning ☀️" / "Good afternoon 🌤️" / "Good evening 🪐"
- [x] Composer is the existing `Composer` component in card mode, auto-focused
- [x] Animated placeholder cycles through context-aware phrases with typewriter effect
- [x] Placeholder phrases change based on whether an existing stream is selected
- [x] Stream context selector dropdown shows existing streams and "Something new" option
- [x] Submitting with no stream selected: generates temp slug, creates stream, navigates immediately, sends message
- [x] Submitting with a stream selected: creates chat session in existing stream, navigates, sends message
- [x] Sidebar updates with new stream after submission
- [x] Loading state: composer is disabled while streams store is loading
- [x] Error handling: toast error if stream/chat creation fails, composer re-enabled

## Edge Cases

- **No streams:** Same home experience. Stream context selector shows only "Something new". Sidebar is empty.
- **Many streams:** Streams listed in the context selector dropdown and in the sidebar.
- **sessionStorage unavailable:** Stream is created and user navigates to it, but the pending message is lost. User retypes in the stream's composer. No crash.
- **Stream creation fails:** Toast error, composer re-enabled, no navigation.
- **Double-submit:** Composer disables on first submit (`isCreating` state). Second press is a no-op.
- **Browser back after creating stream:** Returns to `/` (home). The created stream persists in the sidebar.
- **Race condition — sessionStorage consumed before sendMessage ready:** The `ChatSessionProvider` effect runs after mount. The `sendMessage` function on the store is always available (defined at store creation). The sessionId is set on the ref before calling `sendMessage`. No race.

## Constraints

- Light mode only (per foundation spec constraints).

## Testing

**Greeting** (`components/features/home/greeting/greeting.test.tsx`):

- [x] Returns "Good morning" when hour < 12 (`greeting.test.tsx`)
- [x] Returns "Good afternoon" when hour is 12–16 (`greeting.test.tsx`)
- [x] Returns "Good evening" when hour >= 17 (`greeting.test.tsx`)

**HomeComposer** (`components/features/home/home-composer/home-composer.test.tsx`):

- [x] On submit (new stream): generates temp slug, calls createStream + createChatSession in parallel (`home-composer.test.tsx`)
- [x] On submit: stores pending message in sessionStorage under `q-home-message` (`home-composer.test.tsx`)
- [x] On submit: stores pending message in sessionStorage under `q-home-message` (`home-composer.test.tsx`)
- [x] On submit: optimistically adds stream entry (`home-composer.test.tsx`)
- [x] On submit: navigates via router.push with temp slug (`home-composer.test.tsx`)
- [x] Shows disabled state while creating (`home-composer.test.tsx`)
- [x] Shows toast error if createStream fails; does not navigate (`home-composer.test.tsx`)

**Pending message handoff** (ChatSessionProvider → stream page):

- [x] ChatSessionProvider reads `q-home-message` from sessionStorage on mount and calls sendMessage (`components/features/desktop/chat-session-provider.test.tsx`)
- [x] Pending message consumed only when slug matches current streamSlug (`components/features/desktop/chat-session-provider.test.tsx`)
- [x] sessionStorage key is removed after consumption (no double-send) (`components/features/desktop/chat-session-provider.test.tsx`)
- [x] Malformed sessionStorage JSON does not crash — clears key and continues (`components/features/desktop/chat-session-provider.test.tsx`)

**Not tested (UI rendering):**

- Layout positioning, animated placeholder timing, stream context selector dropdown behavior

## Cross-References

- [App Shell](app-shell.md) — Routing, `/` route definition, stream creation flow
- [Sidebar](sidebar.md) — Global sidebar renders on home, streams list
- [Chat](chat.md) — Composer component reused in card mode
- [Data Flow](data-flow.md) — `streamsStore`, server actions, SWR mutation
- [Desktop](desktop.md) — `ChatSessionProvider` modification for pending message pickup
