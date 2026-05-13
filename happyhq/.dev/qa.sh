#!/bin/bash
set -o pipefail
# Usage: ./qa.sh [options]
#   ./qa.sh                     # triage + execute on PRs labeled ralphie:ready-to-merge or needs-qa
#   ./qa.sh --triage-only       # Phase 1 only — post / edit triage comments, don't execute
#   ./qa.sh --execute-only      # Phase 2 only — fan out execute over current queue (reads existing triage comments)
#   ./qa.sh --pr 240            # triage + execute one specific PR
#   ./qa.sh --pr 240 --override # also force explicit verification regardless of author testing
#   ./qa.sh --dry-run           # Phase 1 preview only, no triage comments posted / edited

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

# Sweep stray QA screenshot artifacts before the clean-tree check. Prior
# execute sessions occasionally mis-routed screenshots into the repo instead
# of /tmp/qa-bespoke-${PR_NUMBER}/, leaving them as untracked files that
# block the next run. Narrow glob — only qa-*.png directly under .dev/.
find "$REPO_ROOT/happyhq/.dev" -maxdepth 1 -type f -name 'qa-*.png' -delete 2>/dev/null || true

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

# Kill processes matching $1 whose cwd is under $REPO_ROOT — i.e. only
# processes this loop spawned, not the user's own dev/test runs in a
# sibling worktree.
kill_scoped() {
    local pattern="$1"
    local pid cwd
    for pid in $(pgrep -f "$pattern" 2>/dev/null); do
        cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {sub(/^n/,""); print; exit}')
        if [[ -n "$cwd" && "$cwd" == "$REPO_ROOT"* ]]; then
            kill "$pid" 2>/dev/null || true
        fi
    done
}

cleanup() {
    echo -e "\n${DIM}Cleaning up child processes...${RESET}"
    pkill -P $$ 2>/dev/null
    kill_scoped "node.*vitest"
    # Stop any lingering dev server from a smoke run mid-execute.
    # dev-server.ts is PID-file-scoped per cwd hash, so this only kills
    # the server this loop started — not the user's own `pnpm dev`.
    (cd "$REPO_ROOT/happyhq" && npx tsx scripts/dev-server.ts stop 2>/dev/null) || true
    exit 0
}
trap cleanup SIGINT SIGTERM

if [ -n "$DRY_RUN" ]; then
    export DRY_RUN_NOTE="**DRY RUN MODE**: This is a triage-phase preview. Read the queue, walk the litmus test for each PR, but do NOT post or edit any QA: triage comments. Print the would-be comment bodies to stdout instead. Do not invoke any 'gh pr edit', 'gh pr comment', 'gh api PATCH', 'git commit', or 'git push'."
else
    export DRY_RUN_NOTE=""
fi

if [ -n "$OVERRIDE" ]; then
    export OVERRIDE_NOTE="**OVERRIDE MODE**: The maintainer invoked --override on this single-PR session. Don't trust author testing regardless of how thick it looks — write an explicit verification at execute time and run it. Smoke runs unconditionally as backstop. Hard constraints (no auto-merge, no push to PR branch, only operate in qa worktree) remain non-negotiable. Note the override in the qa-pass / qa-fail comment: 'Maintainer invoked --override; explicit verification was performed regardless of author testing.'"
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

# ── Single-PR mode: triage one PR, then execute it ──
if [ -n "$SINGLE_PR" ]; then
    export SINGLE_PR
    run_session "PROMPT_qa_triage.md" "Triage · PR #${SINGLE_PR}"
    TRIAGE_EXIT=$?
    if [ $TRIAGE_EXIT -ne 0 ]; then
        echo -e "  ${RED}Triage exited with status $TRIAGE_EXIT — stopping${RESET}"
        exit $TRIAGE_EXIT
    fi

    if [ -n "$DRY_RUN" ]; then
        echo -e "\n  ${GREEN}✓${RESET} Phase 1 preview complete (DRY RUN). Skipping execute."
        exit 0
    fi

    # Snap to clean state before execute (in case triage left state).
    git -C "$REPO_ROOT" checkout "$BASE_BRANCH" >/dev/null 2>&1 || true
    git -C "$REPO_ROOT" reset --hard origin/main >/dev/null 2>&1 || true
    (cd "$REPO_ROOT" && (pnpm install --frozen-lockfile 2>/dev/null || pnpm install)) >/dev/null 2>&1 || true
    (cd "$REPO_ROOT/happyhq" && npx tsx scripts/dev-server.ts stop 2>/dev/null) || true

    export PR_NUMBER="$SINGLE_PR"
    run_session "PROMPT_qa_execute.md" "Execute · PR #${SINGLE_PR}"
    EXECUTE_EXIT=$?

    (cd "$REPO_ROOT/happyhq" && npx tsx scripts/dev-server.ts stop 2>/dev/null) || true
    exit $EXECUTE_EXIT
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
        echo -e "\n  ${GREEN}✓${RESET} Triage complete (--triage-only). Plans posted as QA: triage comments on each PR."
        exit 0
    fi

    if [ -n "$DRY_RUN" ]; then
        echo -e "\n  ${GREEN}✓${RESET} Phase 1 preview complete (DRY RUN). Skipping Phase 2."
        exit 0
    fi
fi

# ── Phase 2: query queue, fan out execute one-per-PR ──
echo -e "\n  ${DIM}Querying queue for execute fanout…${RESET}"
QUEUE_PRS=$(gh pr list --state open --limit 100 \
    --json number,labels \
    --jq '[.[]
      | select(.labels | map(.name) | any(. == "ralphie:ready-to-merge" or . == "needs-qa"))
      | select(.labels | map(.name) | any(. == "ralphie:qa-pass" or . == "ralphie:qa-fail") | not)
      ] | sort_by(.number) | .[] | .number')

if [ -z "$QUEUE_PRS" ]; then
    echo -e "  ${GREEN}✓${RESET} No PRs in queue. Nothing to execute."
    exit 0
fi

QUEUE_COUNT=$(echo "$QUEUE_PRS" | wc -l | tr -d ' ')
echo -e "  ${DIM}Fanning out ${QUEUE_COUNT} PR$([ "$QUEUE_COUNT" -ne 1 ] && echo s)…${RESET}"

i=0
ERROR_COUNT=0
for PR in $QUEUE_PRS; do
    i=$((i+1))

    # Snap to clean state before each PR (the previous PR may have left a branch checked out).
    git -C "$REPO_ROOT" checkout "$BASE_BRANCH" >/dev/null 2>&1 || true
    git -C "$REPO_ROOT" reset --hard origin/main >/dev/null 2>&1 || true
    (cd "$REPO_ROOT" && (pnpm install --frozen-lockfile 2>/dev/null || pnpm install)) >/dev/null 2>&1 || true
    (cd "$REPO_ROOT/happyhq" && npx tsx scripts/dev-server.ts stop 2>/dev/null) || true

    export PR_NUMBER="$PR"
    run_session "PROMPT_qa_execute.md" "PR #${PR} (${i} of ${QUEUE_COUNT})"
    UNIT_EXIT=$?
    if [ $UNIT_EXIT -ne 0 ]; then
        echo -e "  ${YELLOW}⚠ PR #${PR} session exited with status $UNIT_EXIT — continuing${RESET}"
        ERROR_COUNT=$((ERROR_COUNT+1))
    fi
done

# Final cleanup — return to base, kill any lingering dev server.
git -C "$REPO_ROOT" checkout "$BASE_BRANCH" >/dev/null 2>&1 || true
git -C "$REPO_ROOT" reset --hard origin/main >/dev/null 2>&1 || true
(cd "$REPO_ROOT/happyhq" && npx tsx scripts/dev-server.ts stop 2>/dev/null) || true

echo -e "\n  ${GREEN}✓${RESET} QA pass complete. PRs processed: ${QUEUE_COUNT}$([ $ERROR_COUNT -gt 0 ] && echo " (${ERROR_COUNT} errors)")"
echo -e "  ${DIM}Per-PR outcomes posted as labels and comments on each PR.${RESET}"
