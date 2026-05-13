#!/bin/bash
set -o pipefail
# Usage: ./tech-debt.sh [options]
#   ./tech-debt.sh                          # triage + fix loop, default --max-issues 3
#   ./tech-debt.sh --max-issues 5           # cap Phase 2 attempts at 5
#   ./tech-debt.sh --triage-only            # Phase 1 only
#   ./tech-debt.sh --fix-only               # skip Phase 1, run the fix loop on the queue
#   ./tech-debt.sh --issue 203              # skip triage; one fix session against #203
#   ./tech-debt.sh --issue 203 --override   # bypass self-skip rules (rescope, risk-gate, verification) for that issue
#   ./tech-debt.sh --dry-run                # Phase 1 preview only, no writes
#   ./tech-debt.sh --issue 203 --dry-run    # preview a single fix session, no writes

DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

MAX_ISSUES=3
TRIAGE_ONLY=0
FIX_ONLY=0
SINGLE_ISSUE=""
DRY_RUN=""
OVERRIDE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --max-issues)
            MAX_ISSUES="$2"
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
        --override)
            OVERRIDE=1
            shift
            ;;
        -h|--help)
            sed -n '3,12p' "$0" | sed 's/^# \?//'
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
if [ -n "$OVERRIDE" ] && [ -z "$SINGLE_ISSUE" ]; then
    echo "Error: --override is only valid with --issue <#>. The Phase 2 auto-loop must always respect skip gates." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# ── Worktree-aware base branch resolution ──
# Tech-debt is required to run from the dedicated worktree, never from the
# primary checkout. The maintainer's `happyhq/` stays free for collaborative
# work, and the loop never runs on `main`. Setup (one-time):
#   git worktree add ../happyhq-debt -b loop/debt origin/main
REPO_ROOT="$(git rev-parse --show-toplevel)"
case "$REPO_ROOT" in
    */happyhq-debt)
        BASE_BRANCH="loop/debt"
        ;;
    *)
        echo -e "  ${RED}Error: tech-debt.sh must run from the tech-debt worktree (.../happyhq-debt). Current: ${REPO_ROOT}${RESET}" >&2
        echo -e "  ${DIM}Set up the worktree once with: git worktree add ../happyhq-debt -b loop/debt origin/main${RESET}" >&2
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
    exit 0
}
trap cleanup SIGINT SIGTERM

if [ -n "$DRY_RUN" ]; then
    export DRY_RUN_NOTE="**DRY RUN MODE**: For every action that would write to GitHub or the repo (labels, comments, branches, commits, pushes, PRs, child issues), print one line prefixed with 'DRY-RUN:' describing what you WOULD do, then SKIP the actual call. Do not invoke any 'gh issue edit', 'gh issue comment', 'gh issue create', 'gh pr create', 'git commit', 'git push', or filesystem write outside of pnpm install / verification scratch. Reads (gh issue view/list, code search, file reads, pnpm install, verification scripts) are fine."
else
    export DRY_RUN_NOTE=""
fi

if [ -n "$OVERRIDE" ]; then
    export OVERRIDE_NOTE="**OVERRIDE MODE**: The maintainer invoked --override on this single-issue session. Skip the soft self-skip checks: do NOT apply ralphie:skip-needs-rescope, ralphie:skip-verification-failed, or ralphie:split-into-children, and do NOT exit early on those conditions — push and open the PR anyway. Hard constraints from the rubric (no push to main, no edits to happyhq/ee/, .github/, CI workflows, lockfiles beyond focused fix, or licensing files) remain non-negotiable. Note the override in the PR body's AI-disclosure paragraph: 'Maintainer invoked --override; rescope/risk/verification self-skip gates were bypassed.'"
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

# ── Single-issue mode: skip triage, run one fix session ──
if [ -n "$SINGLE_ISSUE" ]; then
    export ISSUE_NUMBER="$SINGLE_ISSUE"
    run_session "PROMPT_tech_debt_fix.md" "Fix #$SINGLE_ISSUE"
    exit $?
fi

# ── Phase 1: Triage (skipped with --fix-only) ──
if [ $FIX_ONLY -eq 0 ]; then
    run_session "PROMPT_tech_debt_triage.md" "Phase 1 · Triage"
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
        echo -e "\n  ${GREEN}✓${RESET} Phase 1 preview complete. Skipping Phase 2 in --dry-run (labels weren't applied, so the fix queue would re-pick the same issues). Use --issue <#> --dry-run to preview a fix session."
        exit 0
    fi
fi

# ── Phase 2: Fix loop (one session per eligible issue — oldest first) ──
ISSUES_DONE=0
while [ $ISSUES_DONE -lt $MAX_ISSUES ]; do
    NEXT=$(gh issue list \
        --label tech-debt \
        --state open \
        --limit 100 \
        --json number,labels,createdAt \
        --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)] | sort_by(.createdAt) | .[0].number // empty' 2>/dev/null)

    if [ -z "$NEXT" ]; then
        echo -e "\n  ${GREEN}✓${RESET} Queue empty. $ISSUES_DONE issue(s) attempted. Exiting."
        exit 0
    fi

    ISSUES_DONE=$((ISSUES_DONE + 1))
    export ISSUE_NUMBER="$NEXT"
    run_session "PROMPT_tech_debt_fix.md" "Phase 2 · Issue $ISSUES_DONE of max $MAX_ISSUES · #$NEXT"
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

    kill_scoped "node.*vitest"
    sleep 1
done

echo -e "\n  ${YELLOW}Reached --max-issues=$MAX_ISSUES. Stopping.${RESET}"
