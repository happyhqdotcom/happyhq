#!/bin/bash
set -o pipefail
# Usage: ./dependency.sh [options]
#   ./dependency.sh                          # triage + upgrade loop, default --max-deps 3
#   ./dependency.sh --max-deps 5             # cap Phase 2 attempts at 5
#   ./dependency.sh --triage-only            # Phase 1 only
#   ./dependency.sh --upgrade-only           # skip Phase 1, run upgrade loop on the queue
#   ./dependency.sh --pr 124                 # skip triage; one upgrade session against PR #124
#   ./dependency.sh --pr 124 --override      # bypass self-skip rules (size, verification) for that PR
#   ./dependency.sh --dry-run                # Phase 1 preview only, no writes
#   ./dependency.sh --pr 124 --dry-run       # preview a single upgrade session, no writes

DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

MAX_DEPS=3
TRIAGE_ONLY=0
UPGRADE_ONLY=0
SINGLE_PR=""
DRY_RUN=""
OVERRIDE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --max-deps)
            MAX_DEPS="$2"
            shift 2
            ;;
        --triage-only)
            TRIAGE_ONLY=1
            shift
            ;;
        --upgrade-only)
            UPGRADE_ONLY=1
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
            sed -n '3,11p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown flag: $1" >&2
            exit 1
            ;;
    esac
done

if [ $TRIAGE_ONLY -eq 1 ] && [ $UPGRADE_ONLY -eq 1 ]; then
    echo "Error: --triage-only and --upgrade-only are mutually exclusive" >&2
    exit 1
fi
if [ $UPGRADE_ONLY -eq 1 ] && [ -n "$DRY_RUN" ]; then
    echo "Error: --upgrade-only --dry-run isn't supported (dry-run on upgrades wastes a real session). Use --pr <#> --dry-run to preview a single upgrade." >&2
    exit 1
fi
if [ -n "$OVERRIDE" ] && [ -z "$SINGLE_PR" ]; then
    echo "Error: --override is only valid with --pr <#>. The Phase 2 auto-loop must always respect skip gates." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

cleanup() {
    echo -e "\n${DIM}Cleaning up child processes...${RESET}"
    pkill -P $$ 2>/dev/null
    pkill -f "node.*vitest" 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

if [ -n "$DRY_RUN" ]; then
    export DRY_RUN_NOTE="**DRY RUN MODE**: For every action that would write to GitHub or the repo (labels, comments, branches, commits, pushes, PRs, merges, closes), print one line prefixed with 'DRY-RUN:' describing what you WOULD do, then SKIP the actual call. Do not invoke any 'gh pr edit', 'gh pr comment', 'gh pr merge', 'gh pr close', 'gh pr create', 'git commit', 'git push', or filesystem write outside of pnpm install / verification scratch. Reads (gh pr view/list/diff/checks, code search, file reads, pnpm install, verification scripts, smoke tests) are fine."
else
    export DRY_RUN_NOTE=""
fi

if [ -n "$OVERRIDE" ]; then
    export OVERRIDE_NOTE="**OVERRIDE MODE**: The maintainer invoked --override on this single-PR session. Skip the soft self-skip checks: do NOT apply ralphie:skip-too-big or ralphie:skip-verification-failed, and do NOT exit early on those conditions — push and open the replacement PR (or merge) anyway. Hard constraints from rule [2] (no push to main, no push to Dependabot branches, no edits to happyhq/ee/, .github/, CI workflows, dependabot.yml, or licensing files) remain non-negotiable. Note the override in the replacement PR body's AI-disclosure paragraph: 'Maintainer invoked --override; size/verification self-skip gates were bypassed.'"
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

# ── Single-PR mode: skip triage, run one upgrade session ──
if [ -n "$SINGLE_PR" ]; then
    export PR_NUMBER="$SINGLE_PR"
    run_session "PROMPT_dependency_upgrade.md" "Upgrade #$SINGLE_PR"
    exit $?
fi

# ── Phase 1: Triage (skipped with --upgrade-only) ──
if [ $UPGRADE_ONLY -eq 0 ]; then
    run_session "PROMPT_dependency_triage.md" "Phase 1 · Triage"
    TRIAGE_EXIT=$?
    if [ $TRIAGE_EXIT -ne 0 ]; then
        echo -e "  ${RED}Triage exited with status $TRIAGE_EXIT — stopping${RESET}"
        exit $TRIAGE_EXIT
    fi

    if [ $TRIAGE_ONLY -eq 1 ]; then
        echo -e "\n  ${GREEN}✓${RESET} Triage complete (--triage-only). Exiting."
        exit 0
    fi

    if [ -n "$DRY_RUN" ]; then
        echo -e "\n  ${GREEN}✓${RESET} Phase 1 preview complete. Skipping Phase 2 in --dry-run (labels weren't applied, so the upgrade queue would re-pick the same PRs). Use --pr <#> --dry-run to preview an upgrade session."
        exit 0
    fi
fi

# ── Phase 2: Upgrade loop (one session per eligible PR — oldest first) ──
DEPS_DONE=0
while [ $DEPS_DONE -lt $MAX_DEPS ]; do
    NEXT=$(gh pr list \
        --author "app/dependabot" \
        --state open \
        --limit 100 \
        --json number,labels,createdAt \
        --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)] | sort_by(.createdAt) | .[0].number // empty' 2>/dev/null)

    if [ -z "$NEXT" ]; then
        echo -e "\n  ${GREEN}✓${RESET} Queue empty. $DEPS_DONE PR(s) attempted. Exiting."
        exit 0
    fi

    DEPS_DONE=$((DEPS_DONE + 1))
    export PR_NUMBER="$NEXT"
    run_session "PROMPT_dependency_upgrade.md" "Phase 2 · PR $DEPS_DONE of max $MAX_DEPS · #$NEXT"
    SESSION_EXIT=$?
    if [ $SESSION_EXIT -ne 0 ]; then
        echo -e "  ${RED}Upgrade session exited with status $SESSION_EXIT — stopping loop${RESET}"
        exit $SESSION_EXIT
    fi

    # Verify the PR moved to a terminal state — either closed (merged or replaced)
    # or labeled with a ralphie:skip-* / ralphie:replaced-by-* label. Otherwise the
    # next iteration would re-pick it forever.
    PR_INFO=$(gh pr view "$NEXT" --json state,labels 2>/dev/null)
    STATE=$(echo "$PR_INFO" | jq -r '.state')
    HAS_RALPHIE_LABEL=$(echo "$PR_INFO" | jq '[.labels[].name | select(startswith("ralphie:"))] | length')
    if [ "$STATE" = "OPEN" ] && [ "$HAS_RALPHIE_LABEL" = "0" ]; then
        echo -e "  ${RED}PR #$NEXT is still open with no ralphie:* label after the session — aborting loop to avoid re-picking it.${RESET}"
        exit 1
    fi

    # Clean up any orphaned vitest/dev-server processes from the session
    pkill -f "node.*vitest" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    sleep 1
done

echo -e "\n  ${YELLOW}Reached --max-deps=$MAX_DEPS. Stopping.${RESET}"
