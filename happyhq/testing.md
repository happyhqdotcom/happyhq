## Philosophy

Tests verify behavior and contracts, not implementation details. 50 different
implementations should pass the same test. A test should only break when the
actual guarantee to the user is violated.

**Test these:**

- Input/output contracts (data transformations, API responses)
- Error handling contracts (ENOENT returns null, invalid paths throw)
- Security boundaries (path traversal, input validation)
- State machine transitions (streaming -> complete, loading -> error)
- User interaction flows (upload -> stage -> submit -> clear)
- Conditional rendering driven by state (loading/error/empty/populated)

**Don't test these:**

- Specific UI copy or placeholder text ("Message Q...")
- CSS class names (.animate-pulse, .animate-fade-in)
- Trivial state: setState(x) then getState() === x
- That a mock was called (unless the call IS the contract)
- That a specific HTML element/testid exists (unless testing conditional rendering logic)
- Snapshot tests or "renders without crashing" tests

**Litmus test:** "What bug would this catch?" If the answer is "someone changed
the copy" or "someone renamed a CSS class," delete the test.

## Property-Based Testing

We use `fast-check` for property-based testing. Instead of picking specific examples,
you define properties (invariants that must always hold) and fast-check generates
hundreds of random inputs to try to break them. When it finds a failure, it shrinks
the input to the minimal reproduction.

### When PBT earns its keep

PBT works when the generator naturally matches the real input space. The test is:
"would `fc.string()` or `fc.record()` or `fc.oneof()` generate inputs that look
like what this function actually receives?" If yes, PBT. If you need a hand-tuned
generator, write an example test instead.

**Good candidates:**

- **Parsers facing user input** — slug generation, Q/A answer parsing, file markers,
  HTML extraction. `fc.string()` matches because users type anything.
  Pattern: compose → parse round-trip. (`lib/format.test.ts`, `lib/chat/parse-history.server.test.ts`)

- **Security validators** — bash command safety, path validation. `fc.string()` with
  `fc.constantFrom()` for command separators. The property is "unsafe commands never
  pass." (`lib/agents/bash-safety.server.test.ts`)

- **Data classification with coverage assumptions** — quality assessment, Unicode
  range checking. Generate text from specific script ranges (`fc.integer()` mapped
  to code points) and verify classification. (`lib/fs/assess-quality.server.test.ts`)

- **Object routing / discrimination** — message filtering, config merging. Generate
  arbitrary discriminated-union objects with `fc.record()` + `fc.oneof()`, verify
  routing decisions. (`lib/run/filter.server.test.ts`, `lib/config/defaults.test.ts`)

- **Structural invariants on collections** — time-based grouping, deduplication.
  Generate arrays of records, verify every item lands in exactly one group, no
  empty groups, order preserved. (`lib/time-groups.test.ts`)

**Bad candidates:**

- Internal functions called with predictable typed data from other functions
- Functions with side effects (database, filesystem, network)
- Anything where you need a hand-tuned generator to find bugs — if `fc.double()`
  can't find the rounding edge case but `fc.nat().map(n => n/10)` can, that's a
  sign the real callers send predictable data. Write an example test for the
  specific edge case instead.

### How to write a PBT test

1. Pick the property — what must ALWAYS be true? (idempotent, round-trips, no
   unsafe values in output, all items accounted for, valid classification)
2. Pick the generator — use the simplest one that matches the real input space.
   `fc.string()` for user input, `fc.record()` for structured data,
   `fc.constantFrom()` for enums, `fc.array()` for collections.
3. Write the assertion with `fc.assert(fc.property(generator, (input) => { ... }))`.
4. If it fails, fix the code. If you need to filter the generator to make it pass,
   document why in a comment — it's either an accepted format limitation
   (`, ` in a comma-separated list) or a sign you need an example test instead.

### What PBT does NOT solve

PBT finds bugs in the input space you didn't think to test. It does not solve
the problem of testing the wrong property. If the same person writes the code
and picks the properties, they share the same blind spots about what the code
should do — PBT just verifies it more thoroughly within those assumptions.

## Vitest & jsdom Gotchas

- Vitest mock gotcha: `node:fs` and `node:fs/promises` both require an explicit `default` property in the mock factory. Use `vi.hoisted()` for mock fns referenced in `vi.mock()` factories. Use `node:` prefix for Node built-in imports in `.server.ts` files.
- Vitest JSX: `esbuild: { jsx: 'automatic' }` in vitest.config.mts enables JSX in test files without explicit React imports. Required because tsconfig uses `jsx: "preserve"`.
- Component test pattern: mock `swr` default export and `next/navigation` `useRouter` via `vi.hoisted()` + `vi.mock()`. Use `error?.status === 404` (plain object) for 404 test cases — no need to import FetchError.
- API route handlers use standard `Request` type (not `NextRequest`) with `new URL(request.url).searchParams` — testable with plain `Request` objects in Vitest
- jsdom `File`/`Blob` lack `arrayBuffer()` — when testing server actions that handle FormData file uploads, mock FormData's `get()` to return a plain object with `name` and `arrayBuffer()` instead of using the jsdom `File` constructor
- jsdom lacks `scrollIntoView` — mock it globally in tests: `Element.prototype.scrollIntoView = vi.fn()`
- `@testing-library/user-event` is NOT installed — use `fireEvent` from `@testing-library/react` for click/change/keydown events in component tests
- `vi.clearAllMocks()` resets mock return values set via `.mockResolvedValue()` in `vi.hoisted()` — if a test depends on a specific mock return value, re-set it in the test body
- `@testing-library/jest-dom` is NOT installed — do not use `.toBeInTheDocument()` or `.toHaveAttribute()`. Use `.not.toBeNull()`, `.toBeNull()`, and `.getAttribute()` instead
- Catalyst `Dialog` (Headless UI) uses portals and transitions that don't render children in jsdom — mock it to render children directly when `open=true`. Other Catalyst components (Button, Input, Field, Label) render as standard HTML and work without mocking
- `input-otp` uses `ResizeObserver` which jsdom lacks — mock `@/components/common/ui/input-otp` in tests that render OTP inputs. Capture the `onComplete` callback from the mock to test verification flows
