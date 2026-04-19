# Backlog

What's next for Ralphie.

## Completed

- ~~**Move from progress.txt to git-powered completion signal**~~ — `[done]` in git commit message replaces `★` in `progress.txt`. Loop checks via `isTaskCompleted()` in `lib/git/sync.server.ts`. progress.txt fully removed — plan.md is now the living progress document.
- ~~**File History (v1)**~~ — Server-side git history retrieval (`lib/git/log.server.ts`) plus dropdown in markdown windows for browsing previous versions. Version numbers, dirty file detection, read-only historical view. See [history.md](history.md).
- ~~**Git Log window**~~ — Stream-level desktop window showing commit history with scope toggle (task/stream/all), dirty files indicator, and `[done]` green badge styling. See [desktop.md](desktop.md).
- ~~**Context window usage metrics**~~ — Track peak single-call input tokens per iteration. `contextWindowUsedPct` in `IterationMetrics` stored in `.run.json`. See [working.md](working.md).
- ~~**Drafting subagent: Write tool**~~ — Drafting now writes artifacts directly via Write tool, eliminating token reproduction from parent re-typing. See [agent-config.md](agent-config.md).
- ~~**Remove QA verification step**~~ — Removed "review against specs" step from working prompt. Benchmarked: added 33% to working time with no quality improvement. See [prompts.md](prompts.md).

## Next Up

- **Templates** — Stream templates for guided starts. Create, share, and use packaged stream starting points. Spec ready in [templates.md](templates.md).
- **First-Time User Onboarding** — Q opens with a conversational explainer for users who have never chatted before. Detect via cross-stream chat history check, inject signal into learning prompt. Spec ready in [learning.md](learning.md) under "First-Time Onboarding".
