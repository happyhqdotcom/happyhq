#!/bin/bash
set -o pipefail
# Usage: ./qa.sh [options]
#   ./qa.sh                    # triage + execute on PRs labeled ralphie:ready-to-merge
#   ./qa.sh --triage-only      # Phase 1 only — write the cohort plan, don't execute
#   ./qa.sh --execute-only     # Phase 2 only — read latest plan, run it
#   ./qa.sh --pr 240           # skip triage; QA one specific PR (treated as smoke-isolated)
#   ./qa.sh --pr 240 --override # also bypass any soft-skip rules for that PR
#   ./qa.sh --dry-run          # Phase 1 preview only, no plan file written

DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

TRIAGE_ONLY=0
EXECUTE_ONLY=0
SINGLE_PR=""
DRY_RUN=""
OVERRIDE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --triage-only)
            TRIAGE_ONLY=1
            shift
            ;;
        --execute-only)
            EXECUTE_ONLY=1
            shift
            ;;
        --pr)
            SINGLE_PR="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --override)
            OVERRIDE=1
            shift
            ;;
        -h|--help)
            sed -n '3,9p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown flag: $1" >&2
            exit 1
            ;;
    esac
done

if [ $TRIAGE_ONLY -eq 1 ] && [ $EXECUTE_ONLY -eq 1 ]; then
    echo "Error: --triage-only and --execute-only are mutually exclusive" >&2
    exit 1
fi
if [ $EXECUTE_ONLY -eq 1 ] && [ -n "$DRY_RUN" ]; then
    echo "Error: --execute-only --dry-run isn't supported (dry-run on execute would burn smoke runs and skip writes — pointless)." >&2
    exit 1
fi
if [ -n "$OVERRIDE" ] && [ -z "$SINGLE_PR" ]; then
    echo "Error: --override is only valid with --pr <#>." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# ── Worktree-aware base branch resolution ──
# Same pattern as bugs.sh / dependency.sh — the QA worktree owns `loop/qa`,
# the primary checkout is `main`. Anything else is an error: QA must run
# from a known location.
REPO_ROOT="$(git rev-parse --show-toplevel)"
case "$REPO_ROOT" in
    */happyhq-qa)
        BASE_BRANCH="loop/qa"
        ;;
    */happyhq)
        BASE_BRANCH="main"
        ;;
    *)
        echo -e "  ${RED}Error: qa.sh must run from the primary checkout (.../happyhq) or the qa worktree (.../happyhq-qa). Current: ${REPO_ROOT}${RESET}" >&2
        exit 1
        ;;
esac
export BASE_BRANCH

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]; then
    echo -e "  ${RED}Error: ${REPO_ROOT} should be on '${BASE_BRANCH}', not '${CURRENT_BRANCH}'.${RESET}" >&2
    echo -e "  ${DIM}Fix: git -C ${REPO_ROOT} checkout ${BASE_BRANCH}${RESET}" >&2
    exit 1
fi

# Guard against losing uncommitted work — the next step is `git reset --hard`.
if [ -n "$(git status --porcelain)" ]; then
    echo -e "  ${RED}Error: uncommitted changes in ${REPO_ROOT}. Commit, stash, or discard before running the loop — the next step hard-resets to origin/main.${RESET}" >&2
    git status --short >&2
    exit 1
fi

echo -e "  ${DIM}Snapping ${BASE_BRANCH} → origin/main (hard reset), then pnpm install…${RESET}"
git fetch origin --quiet || { echo -e "  ${RED}git fetch failed${RESET}" >&2; exit 1; }
git reset --hard origin/main >/dev/null || { echo -e "  ${RED}git reset failed${RESET}" >&2; exit 1; }
(cd "$REPO_ROOT" && (pnpm install --frozen-lockfile || pnpm install)) || { echo -e "  ${RED}pnpm install failed${RESET}" >&2; exit 1; }

# Ensure the triage-plan directory exists.
mkdir -p ~/.cache/qa

cleanup() {
    echo -e "\n${DIM}Cleaning up child processes...${RESET}"
    pkill -P $$ 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    pkill -f "node.*vitest" 2>/dev/null
    # Stop any lingering dev server from a smoke run mid-execute.
    (cd "$REPO_ROOT/happyhq" && npx tsx scripts/dev-server.ts stop 2>/dev/null) || true
    exit 0
}
trap cleanup SIGINT SIGTERM

if [ -n "$DRY_RUN" ]; then
    export DRY_RUN_NOTE="**DRY RUN MODE**: This is a triage-phase preview. Read the queue, classify each PR, group into test units, but do NOT write the plan file to ~/.cache/qa/. Print the would-be plan to stdout instead. Do not invoke any 'gh pr edit', 'gh pr comment', 'git commit', 'git push', or filesystem write."
else
    export DRY_RUN_NOTE=""
fi

if [ -n "$OVERRIDE" ]; then
    export OVERRIDE_NOTE="**OVERRIDE MODE**: The maintainer invoked --override on this single-PR session. Treat the PR as critical-path even if the diff suggests otherwise (smoke runs unconditionally). Do not promote to evidence-sufficient regardless of how thin or thick the Exercise evidence is. Hard constraints (no auto-merge, no push to PR branch, only operate in qa worktree) remain non-negotiable. Note the override in the qa-pass / qa-fail comment: 'Maintainer invoked --override; evidence-sufficient promotion was bypassed.'"
else
    export OVERRIDE_NOTE=""
fi

run_session() {
    local prompt_file="$1"
    local label="$2"

    echo -e "\n  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "  ${BOLD}${label}${RESET}"
    echo -e "  ${DIM}Prompt:${RESET}  $prompt_file"
    [ -n "$DRY_RUN" ] && echo -e "  ${YELLOW}DRY RUN${RESET}"
    echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"

    if [ ! -f "$prompt_file" ]; then
        echo -e "  ${RED}Error: $prompt_file not found${RESET}"
        return 1
    fi

    envsubst < "$prompt_file" | claude -p \
        --dangerously-skip-permissions \
        --output-format=stream-json \
        --model opus \
        --verbose 2>&1 | node "$SCRIPT_DIR/format-stream.mjs"

    return ${PIPESTATUS[1]}
}

# ── Single-PR mode: write a one-unit plan, then run execute against it ──
if [ -n "$SINGLE_PR" ]; then
    # Synthesise a minimal triage plan with this PR as a smoke-isolated unit.
    PLAN_FILE=~/.cache/qa/triage-$(date +%Y%m%dT%H%M%S).md
    cat > "$PLAN_FILE" <<EOF
# QA triage — single-PR mode

Queue: 1 PR (forced via --pr ${SINGLE_PR}). Test units: 1.

## Unit 1 — smoke-isolated: PR #${SINGLE_PR}

**Reasoning:** Single-PR mode invoked via --pr; treating as smoke-isolated regardless of diff classification. ${OVERRIDE:+Override mode active.}

**Diff summary:** (single-PR mode — diff not pre-classified by triage)

**Exercise evidence:** (read the PR body during execute and decide)

EOF
    echo -e "  ${DIM}Wrote single-PR plan to ${PLAN_FILE}${RESET}"
    run_session "PROMPT_qa_execute.md" "Execute · PR #${SINGLE_PR}"
    exit $?
fi

# ── Phase 1: Triage (skipped with --execute-only) ──
if [ $EXECUTE_ONLY -eq 0 ]; then
    run_session "PROMPT_qa_triage.md" "Phase 1 · Triage"
    TRIAGE_EXIT=$?
    if [ $TRIAGE_EXIT -ne 0 ]; then
        echo -e "  ${RED}Triage exited with status $TRIAGE_EXIT — stopping${RESET}"
        exit $TRIAGE_EXIT
    fi

    if [ $TRIAGE_ONLY -eq 1 ]; then
        echo -e "\n  ${GREEN}✓${RESET} Triage complete (--triage-only). Plan: ~/.cache/qa/triage-*.md"
        exit 0
    fi

    if [ -n "$DRY_RUN" ]; then
        echo -e "\n  ${GREEN}✓${RESET} Phase 1 preview complete. Skipping Phase 2 in --dry-run (no plan file written, execute would have nothing to read)."
        exit 0
    fi
fi

# ── Phase 2: Execute ──
run_session "PROMPT_qa_execute.md" "Phase 2 · Execute"
EXECUTE_EXIT=$?

# Belt-and-braces dev server cleanup in case execute exited unexpectedly.
(cd "$REPO_ROOT/happyhq" && npx tsx scripts/dev-server.ts stop 2>/dev/null) || true
pkill -f "next dev" 2>/dev/null || true

if [ $EXECUTE_EXIT -ne 0 ]; then
    echo -e "  ${RED}Execute exited with status $EXECUTE_EXIT${RESET}"
    exit $EXECUTE_EXIT
fi

echo -e "\n  ${GREEN}✓${RESET} QA pass complete."
