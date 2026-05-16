# Spec Registry

These specs are the source of truth for building Q. They define every major concern in the product — from filesystem layout to agent configuration to UI structure.

The specs are structured for the Ralph Wiggum methodology: an AI agent reads specs, performs gap analysis against the current code, and implements what's missing. Each spec covers one concern, describable in a single sentence without "and."

**Next pass:** Add a "Testing" section to each spec describing what should be tested and whether those tests exist. Testing conventions (Vitest/jsdom patterns, gotchas) live in `app/testing.md`.

## Foundations

| Spec                                      | Purpose                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [Foundation](foundation.md)               | Project skeleton — dependencies, shared utilities, visual system, directory structure                       |
| [Filesystem Layout](filesystem-layout.md) | Directory structure and file conventions                                                                    |
| [Git Layer](git-layer.md)                 | Invisible git versioning infrastructure                                                                     |
| [Data Flow](data-flow.md)                 | Read/write/update data flows, API routes, chat streaming, session management, SWR caching, Zustand UI state |
| [Agent Configuration](agent-config.md)    | Q agent configuration (learning, planning, and working modes)                                               |
| [Prompts](prompts.md)                     | How Q's system prompts are written — style, structure, and the include/omit filter                          |

## Workflow

| Spec                          | Purpose                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| [Learning](learning.md)       | Knowledge classification, teaching (including first session), and spec/playbook updates |
| [Samples](samples.md)         | Sample lifecycle, intake, metadata, and indexing                                        |
| [Planning](planning.md)       | Start Task flow, plan generation, and approval via island                               |
| [Working](working.md)         | App-level Ralph loop orchestration and step-by-step work                                |
| [Concurrency](concurrency.md) | Concurrent task runs, git retry, chat send-while-streaming                              |

### End-to-End: Teaching → Task Completion

The primary product flow spans multiple specs. This is the data handoff sequence:

1. **User teaches Q** ([Learning](learning.md), [Chat](chat.md)) — chat in island, files staged to `uploads/`
2. **Q asks questions, learns, and writes** ([Learning](learning.md), [Samples](samples.md)) — playbook.md, specs/, samples via `ProcessSample`
3. **Q proposes a task** ([Learning](learning.md), [Agent Config](agent-config.md)) — `CreateTask` MCP tool (auto-approved, non-blocking) with name, textContext, files; renders as inline Start Task card
4. **User starts task** ([Data Flow](data-flow.md), [Chat](chat.md)) — clicks Start Task card; `createTask()` + `setupTaskFromChat()` server actions create task and move `uploads/` → `inputs/`
5. **Q plans** ([Planning](planning.md)) — fresh session reads inputs/, specs/, samples/; writes `plan.md`
6. **User approves plan** ([Planning](planning.md), [Island](island.md)) — `PlanApproval` UI in island; starts working mode
7. **Q executes** ([Working](working.md), [Git Layer](git-layer.md)) — iterations write to working/, outputs/; auto-commits
8. **UI tracks progress** ([Data Flow](data-flow.md), [Desktop](desktop.md), [Island](island.md)) — SWR polls task content, island shows activity steps

## UI

| Spec                                    | Purpose                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------- |
| [Home](home.md)                         | Home page — greeting and composer                                          |
| [App Shell](app-shell.md)               | Routing, navigation, transitions, and entity primitives                    |
| [Sidebar](sidebar.md)                   | Global sidebar — stream list, top-level actions, collapse to icon rail     |
| [Desktop](desktop.md)                   | The single unified view — icons, windows, files open on desktop            |
| [Island](island.md)                     | Contextual bottom-center control surface — chat, activity, plan approval   |
| [Chat](chat.md)                         | Chat as a surface — floating and sidebar, stream and task contexts         |
| [Chat Attachments](chat-attachments.md) | User-uploaded files on chat messages — shape, upload, pill, inline preview |

## Infrastructure

| Spec                              | Purpose                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------- |
| [Auth](auth.md)                   | Two-layer auth — password gate for deployment, Anthropic credential management   |
| [Accounts](accounts.md)           | User identity — email signup/login via InstantDB, sessions, user profiles (EE)   |
| [Database](database.md)           | Database layer — InstantDB setup, schema, queries, permissions, auth SDK         |
| [Billing](billing.md)             | Pricing tiers, Stripe payments, usage tracking, limit enforcement (EE)           |
| [Templates](templates.md)         | Stream templates — create, share, and use packaged stream starting points        |
| [Deployment](deployment.md)       | Fly.io deployment — containerization, password protection, per-user provisioning |
| [Observability](observability.md) | Debug bundle export for user-reported issues                                     |

## Observability

| Spec                             | Purpose                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| [Logging](logging.md)            | File-based server logging — daily JSONL files in `~/HappyHQ/.logs/` |
| [Debug Bundle](observability.md) | One-click export of chat diagnostics for user-reported issues       |

## Maintenance

| Spec                                                | Purpose                                            |
| --------------------------------------------------- | -------------------------------------------------- |
| [Bugs & Enhancements](../.dev/bugs-enhancements.md) | Known bugs and enhancements (internal dev tracker) |
