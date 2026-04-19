0a. Study `specs/*` with up to 500 parallel Sonnet subagents to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md to understand the plan and current progress.
0c. For reference, the application code is in `app/`, `components/`, `hooks/`, `lib/`.

1. Follow @IMPLEMENTATION_PLAN.md. If there are incomplete implementation tasks, choose ONE — the most important. If ALL implementation tasks are marked complete, skip to step 4 (Close-out). Search the codebase BEFORE making changes — do not assume something is unimplemented. Use up to 500 Sonnet subagents for searches and reads. Use only 1 Sonnet subagent for build and tests. Use Opus subagents for complex reasoning (debugging, architectural decisions). Implement the functionality completely per the specifications. Ultrathink.

2. Write tests when the task has testable behavior — derive test cases from spec acceptance criteria. Do not write tests for static configuration, constants, or setup; the build gate verifies those. Run all tests. Fix any issues discovered.

3. If Q is running locally (`curl -sf http://localhost:3000/api/auth/status > /dev/null`), exercise the feature via API and read logs to confirm it works (see CLAUDE.md "Using Q" and "Debugging Q"). Tests verify plumbing, the API verifies behavior. If Q is not running, skip — do not attempt to start the dev server yourself.

4. Update @IMPLEMENTATION_PLAN.md with findings. `git add -A && git commit`. `git push`.

5. CLOSE-OUT (when all implementation tasks are complete): Compare what was built against the relevant specs in `specs/`. Update specs to match the implementation — the spec should describe what exists, not what was originally planned. Walk acceptance criteria in @IMPLEMENTATION_PLAN.md — verify each against actual code, check off items that pass, fix any that don't. Run verification commands. Commit, then exit. Next iteration picks up where you left off.

**[9]** One task per iteration. Implement it completely, run verification, commit, then exit. Do not start a second task — the next loop iteration will handle it.
**[99]** Tests verify behavior, not implementation. A test should describe what the system guarantees — not how it's built internally. Good: "a path outside ~/HappyHQ/ is rejected." Bad: "validatePath calls path.resolve then startsWith." 50 implementations should pass the same test. Only break when the actual guarantee to the user is violated. Never: `toBeTruthy()`, `toBeDefined()`, snapshot tests, "renders without crashing."
**[999]** Specs describe what exists, not what was originally planned. When implementation deviates from a spec, update the spec during implementation or during close-out (step 4).
**[9999]** @IMPLEMENTATION_PLAN.md is your scope. Only implement tasks listed there. Do not implement features from other specs, even if you notice they are missing. If you discover work needed outside the plan, note it in the plan — do NOT implement it.
**[99999]** Capture the "why" in code comments when the reason isn't obvious.
**[999999]** Single source of truth — no migration shims or compatibility adapters.
**[9999999]** Add logging where needed for debugging.
**[99999999]** Keep @IMPLEMENTATION_PLAN.md current with learnings — future iterations depend on this to avoid duplicating effort.
**[999999999]** Update @CLAUDE.md when you learn new operational info (commands, patterns, gotchas). Route testing-specific gotchas to `testing.md` instead.
**[9999999999]** Resolve any bugs you encounter (related or not) or document them in the plan.
**[99999999999]** Implement functionality COMPLETELY. Placeholders and stubs waste effort and time redoing the same work.
**[999999999999]** Periodically clean completed items from @IMPLEMENTATION_PLAN.md to reduce noise.
**[9999999999999]** Keep @CLAUDE.md OPERATIONAL ONLY — no status updates or progress notes. A bloated CLAUDE.md pollutes every future loop's context.
Verification commands: `pnpm build` · `pnpm test` · `pnpm check-types` · `pnpm lint` · `pnpm format`
