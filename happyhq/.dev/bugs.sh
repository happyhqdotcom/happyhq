#!/bin/bash
set -o pipefail
# Usage: ./bugs.sh [options]
#   ./bugs.sh                          # triage + fix loop, default --max-bugs 3
#   ./bugs.sh --max-bugs 5             # cap Phase 2 attempts at 5
#   ./bugs.sh --triage-only            # Phase 1 only
#   ./bugs.sh --fix-only               # skip Phase 1, run the fix loop on the queue
#   ./bugs.sh --issue 42               # skip triage; one fix session against #42
#   ./bugs.sh --dry-run                # Phase 1 preview only, no writes
#   ./bugs.sh --issue 42 --dry-run     # preview a single fix session, no writes

DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

MAX_BUGS=3
TRIAGE_ONLY=0
FIX_ONLY=0
SINGLE_ISSUE=""
DRY_RUN=""

while [ $# -gt 0 ]; do
    case "$1" in
        --max-bugs)
            MAX_BUGS="$2"
            shift 2
            ;;
        --triage-only)
            TRIAGE_ONLY=1
            shift
            ;;
        --fix-only)
            FIX_ONLY=1
            shift
            ;;
        --issue)
            SINGLE_ISSUE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        -h|--help)
            sed -n '3,10p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown flag: $1" >&2
            exit 1
            ;;
    esac
done

if [ $TRIAGE_ONLY -eq 1 ] && [ $FIX_ONLY -eq 1 ]; then
    echo "Error: --triage-only and --fix-only are mutually exclusive" >&2
    exit 1
fi
if [ $FIX_ONLY -eq 1 ] && [ -n "$DRY_RUN" ]; then
    echo "Error: --fix-only --dry-run isn't supported (dry-run on fixes wastes a real session). Use --issue <#> --dry-run to preview a single fix." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

cleanup() {
    echo -e "\n${DIM}Cleaning up child processes...${RESET}"
    pkill -P $$ 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

if [ -n "$DRY_RUN" ]; then
    export DRY_RUN_NOTE="**DRY RUN MODE**: For every action that would write to GitHub or the repo (labels, comments, branches, commits, pushes, PRs), print one line prefixed with 'DRY-RUN:' describing what you WOULD do, then SKIP the actual call. Do not invoke any 'gh issue edit', 'gh issue comment', 'gh pr create', 'git commit', 'git push', or filesystem write. Reads (gh issue view/list, code search, file reads) are fine."
else
    export DRY_RUN_NOTE=""
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

# ── Single-issue mode: skip triage, run one fix session ──
if [ -n "$SINGLE_ISSUE" ]; then
    export ISSUE_NUMBER="$SINGLE_ISSUE"
    run_session "PROMPT_bugs_fix.md" "Fix #$SINGLE_ISSUE"
    exit $?
fi

# ── Phase 1: Triage (skipped with --fix-only) ──
if [ $FIX_ONLY -eq 0 ]; then
    run_session "PROMPT_bugs_triage.md" "Phase 1 · Triage"
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
        echo -e "\n  ${GREEN}✓${RESET} Phase 1 preview complete. Skipping Phase 2 in --dry-run (labels weren't applied, so the fix queue would re-pick the same bugs). Use --issue <#> --dry-run to preview a fix session."
        exit 0
    fi
fi

# ── Phase 2: Fix loop (one session per bug) ──
BUGS_DONE=0
while [ $BUGS_DONE -lt $MAX_BUGS ]; do
    NEXT=$(gh issue list \
        --label bug \
        --state open \
        --limit 100 \
        --json number,labels,createdAt \
        --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)] | sort_by(.createdAt) | .[0].number // empty' 2>/dev/null)

    if [ -z "$NEXT" ]; then
        echo -e "\n  ${GREEN}✓${RESET} Queue empty. $BUGS_DONE bug(s) attempted. Exiting."
        exit 0
    fi

    BUGS_DONE=$((BUGS_DONE + 1))
    export ISSUE_NUMBER="$NEXT"
    run_session "PROMPT_bugs_fix.md" "Phase 2 · Bug $BUGS_DONE of max $MAX_BUGS · #$NEXT"
    SESSION_EXIT=$?
    if [ $SESSION_EXIT -ne 0 ]; then
        echo -e "  ${RED}Fix session exited with status $SESSION_EXIT — stopping loop${RESET}"
        exit $SESSION_EXIT
    fi

    LABELED=$(gh issue view "$NEXT" --json labels --jq '.labels | map(.name) | any(startswith("ralphie:"))' 2>/dev/null)
    if [ "$LABELED" != "true" ]; then
        echo -e "  ${RED}Issue #$NEXT has no ralphie:* label after the session — aborting loop to avoid re-picking it.${RESET}"
        exit 1
    fi
done

echo -e "\n  ${YELLOW}Reached --max-bugs=$MAX_BUGS. Stopping.${RESET}"
